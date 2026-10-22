import { watch, type FSWatcher } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zstdDecompress } from 'node:zlib';
import { promisify } from 'node:util';
import { completionFileAnchor } from './completion-file-anchor';
import type { CodexCompletionNotice, CodexCompletionState, ConversationNotice } from '../../shared/types';

const decompress = promisify(zstdDecompress);
const MAX_FRAME = 16 * 1024 * 1024, MAX_LINE = 1024 * 1024;
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
type Candidate = { turn: number; seq: number; time: number; kind?: 'question' | 'approval'; request?: string };
type Cursor = {
  offset: number; identity: string; prefix: string; prefixBytes: number; anchor: string; pending: Buffer; line: Buffer; oversized: boolean;
  meta: { id: string; root: boolean; seeded: boolean } | null; seedCut: number; candidates: Candidate[];
};

/** Read the standard Zstandard frame envelope; only checksum-complete frames are decoded.
 * Format reference: facebook/zstd doc/zstd_compression_format.md. No private Node APIs.
 */
export function completeZstdFrame(bytes: Buffer): number | null {
  if (bytes.length < 5) return null;
  if (bytes.readUInt32LE(0) !== 0xfd2fb528) throw new Error('DSH 压缩日志帧无效');
  const flags = bytes[4];
  if (flags & 0x18) throw new Error('DSH 压缩日志头无效');
  const single = Boolean(flags & 32), sizeFlag = flags >>> 6, dictionary = flags & 3;
  let at = 5 + (single ? 0 : 1) + [0, 1, 2, 4][dictionary] + (sizeFlag ? 2 ** sizeFlag : single ? 1 : 0);
  if (bytes.length < at) return null;
  while (true) {
    if (bytes.length < at + 3) return null;
    const block = bytes.readUIntLE(at, 3), kind = (block >>> 1) & 3;
    if (kind === 3) throw new Error('DSH 压缩日志块无效');
    at += 3 + (kind === 1 ? 1 : block >>> 3);
    if (at > MAX_FRAME) throw new Error('DSH 压缩帧过大，暂不支持');
    if (bytes.length < at) return null;
    if (block & 1) break;
  }
  at += flags & 4 ? 4 : 0;
  return bytes.length >= at ? at : null;
}

/** A metadata-only observer of v4 DSH session artifacts. Never mounts the DSH backend,
 * which could migrate/repair files, and never retains message bodies.
 */
export class DeepseekCompletionService {
  private state: CodexCompletionState = { status: 'disabled', directory: '', error: null };
  private enabled = false;
  private scope = '';
  private disposed = false;
  private generation = 0;
  private armedAt = 0;
  private baseline = true;
  private cursors = new Map<string, Cursor>();
  private completed = new Map<string, number>();
  private attentionSeen = new Set<string>();
  private watcher: FSWatcher | undefined;
  private timer?: ReturnType<typeof setInterval>;
  private debounce?: ReturnType<typeof setTimeout>;
  private inflight: Promise<void> | undefined;
  private active = new Set<Promise<void>>();
  constructor(private options: { onNotice: (notice: CodexCompletionNotice) => void; onAttention?: (notice: ConversationNotice) => void; onState?: () => void; now?: () => number; pollMs?: number; watchDirectory?: typeof watch }) {}
  getState(): CodexCompletionState { return { ...this.state }; }
  /** Millisecond watermark on show also discards a completion not scanned while hidden. */
  discardHiddenHistory(): void { this.armedAt = this.now(); }
  private now() { return this.options.now?.() ?? Date.now(); }
  private current(generation: number) { return !this.disposed && this.enabled && generation === this.generation; }
  private update(patch: Partial<CodexCompletionState>) {
    const next = { ...this.state, ...patch };
    if (JSON.stringify(next) !== JSON.stringify(this.state)) { this.state = next; this.options.onState?.(); }
  }
  private stop() { clearInterval(this.timer); clearTimeout(this.debounce); this.watcher?.close(); this.watcher = undefined; }
  async configure(enabled: boolean, directory: string, scope = ''): Promise<void> {
    directory = path.resolve(directory);
    if (this.disposed || (this.enabled === enabled && this.scope === scope && directory === this.state.directory)) return this.inflight;
    this.scope = scope;
    this.stop(); this.generation++; this.enabled = enabled; this.armedAt = this.now(); this.baseline = true;
    this.cursors.clear(); this.completed.clear(); this.attentionSeen.clear(); this.inflight = undefined;
    this.update({ directory, status: enabled ? 'starting' : 'disabled', error: null });
    if (!enabled) return;
    const generation = this.generation;
    await this.check();
    if (this.current(generation)) { this.timer = setInterval(() => { void this.check(); }, this.options.pollMs ?? 2000); this.timer.unref(); }
  }
  check(): Promise<void> {
    if (!this.enabled || this.disposed) return Promise.resolve();
    if (this.inflight) return this.inflight;
    const generation = this.generation;
    const job = this.scan(generation).catch(() => {
      if (this.current(generation)) this.update({ status: 'error', error: '无法读取 DSH 会话目录，将自动重试。' });
    }).finally(() => { this.active.delete(job); if (this.inflight === job) this.inflight = undefined; });
    this.active.add(job); this.inflight = job; return job;
  }
  private async scan(generation: number) {
    try { if (!(await stat(this.state.directory)).isDirectory()) throw new Error('not-directory'); }
    catch (error) { if (!missing(error)) throw error; if (this.current(generation)) { this.baseline = false; this.watcher?.close(); this.watcher = undefined; this.update({ status: 'unavailable', error: '等待 DSH 创建会话目录；也可选择会话目录。' }); } return; }
    if (!this.current(generation)) return;
    if (!this.watcher) try {
      const watcher = (this.options.watchDirectory ?? watch)(this.state.directory, { recursive: true }, () => {
        if (!this.current(generation)) return;
        clearTimeout(this.debounce); this.debounce = setTimeout(() => { void this.check(); }, 80);
      });
      this.watcher = watcher;
      watcher.on('error', () => { watcher.close(); if (this.watcher === watcher) this.watcher = undefined; }); watcher.unref();
    } catch { /* Polling also discovers new directories and repairs lost watches. */ }
    const files = new Set<string>(); let issue: string | null = null;
    const visit = async (directory: string): Promise<void> => {
      let entries; try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if (missing(error)) return; throw error; }
      const logs = entries.filter(entry => entry.isFile() && /^session(?:\.v[1-9]\d*)?\.jsonl(?:\.zstd)?$/.test(entry.name));
      const version = (name: string) => Number(name.match(/\.v(\d+)\./)?.[1] ?? 0);
      const highest = Math.max(-1, ...logs.map(entry => version(entry.name)));
      for (const entry of entries) {
        if (!this.current(generation)) return;
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(filename); // Directory symlinks/junctions are not followed.
        else if (logs.includes(entry) && version(entry.name) === highest) {
          files.add(filename);
          try { await this.read(filename, generation, this.baseline); }
          catch (error) { if (!missing(error)) issue = error instanceof Error && error.message.startsWith('DSH ') ? error.message : 'DSH 日志读取异常，将自动重试；其他会话仍继续监听。'; }
        }
      }
    };
    await visit(this.state.directory);
    if (!this.current(generation)) return;
    for (const file of this.cursors.keys()) if (!files.has(file)) this.cursors.delete(file);
    this.baseline = false; this.update({ status: issue ? 'error' : 'watching', error: issue });
  }
  private consume(cursor: Cursor, bytes: Buffer) {
    let start = 0;
    for (let end = bytes.indexOf(10); end !== -1; end = bytes.indexOf(10, start)) {
      const part = bytes.subarray(start, end); start = end + 1;
      if (!cursor.oversized && cursor.line.length + part.length <= MAX_LINE) {
        const line = Buffer.concat([cursor.line, part]).toString('utf8');
        // Skip body records before parsing. Only a bounded metadata row is materialized.
        if (!cursor.meta || /"type"\s*:\s*"(?:turn\/end|session\/end-seed|tool\/call|approval\/asked|approval\/decided)"/.test(line)) this.row(cursor, line);
      }
      cursor.line = Buffer.alloc(0); cursor.oversized = false;
    }
    const remaining = bytes.subarray(start);
    if (!cursor.oversized && cursor.line.length + remaining.length <= MAX_LINE) cursor.line = Buffer.concat([cursor.line, remaining]);
    else { cursor.line = Buffer.alloc(0); cursor.oversized = true; }
  }
  private row(cursor: Cursor, line: string) {
    let row;
    try { row = JSON.parse(line); } catch { throw new Error('DSH 日志记录损坏，将自动重试'); }
    if (!cursor.meta) {
      if (row?.type !== 'session' || row.version !== 4) throw new Error('DSH 会话格式不兼容，目前仅支持 v4；请检查 DSH 版本。');
      if (typeof row.id !== 'string' || !row.id || row.id.length > 512 || typeof row.isSeeded !== 'boolean' || !Number.isSafeInteger(row.delegationDepth) || row.delegationDepth < 0) throw new Error('DSH 会话头无效');
      cursor.meta = { id: row.id, root: row.origin !== 'subagent' && row.delegationDepth === 0, seeded: row.isSeeded }; return;
    }
    if (row?.type === 'session/end-seed' && row.data?.inherited === true && Number.isSafeInteger(row.seq)) cursor.seedCut = row.seq;
    const request = row.type === 'tool/call' && row.data?.name === 'ask_user_question' ? row.data.callId : row.type === 'approval/asked' ? row.data?.id : null;
    if (cursor.meta.root && typeof request === 'string' && request.length > 0 && request.length <= 512 && Number.isSafeInteger(row.seq) && Number.isSafeInteger(row.time) && row.time > this.armedAt && row.time <= this.now() + 60000) {
      cursor.candidates.push({ turn: row.data.turn ?? 0, seq: row.seq, time: row.time, kind: row.type === 'tool/call' ? 'question' : 'approval', request });
    }
    if (row.type === 'approval/decided') cursor.candidates = cursor.candidates.filter(candidate => candidate.kind !== 'approval' || candidate.request !== row.data?.id);
    if (cursor.meta.root && row?.type === 'turn/end' && row.data?.reason?.kind === 'completed' && Number.isSafeInteger(row.data.turn) && row.data.turn >= 0 && Number.isSafeInteger(row.seq) && row.seq >= 0 && Number.isSafeInteger(row.time) && row.time > this.armedAt && row.time <= this.now() + 60000) {
      cursor.candidates.push({ turn: row.data.turn, seq: row.seq, time: row.time });
    }
  }
  private async read(filename: string, generation: number, baseline: boolean) {
    const info = await stat(filename); if (!this.current(generation)) return;
    const handle = await open(filename, 'r');
    try {
      const head = Buffer.alloc(Math.min(256, info.size)); await handle.read(head, 0, head.length, 0);
      let cursor = this.cursors.get(filename);
      const prefixBytes = Math.min(cursor?.prefixBytes ?? head.length, head.length), prefix = createHash('sha256').update(head.subarray(0, prefixBytes)).digest('hex');
      const identity = `${info.ino}:${info.birthtimeMs}`;
      if (!cursor || cursor.identity !== identity || cursor.offset > info.size || cursor.prefix !== prefix || cursor.anchor !== await completionFileAnchor(handle, cursor.offset)) {
        cursor = { offset: 0, identity, prefix, prefixBytes, anchor: '', pending: Buffer.alloc(0), line: Buffer.alloc(0), oversized: false, meta: null, seedCut: -1, candidates: [] };
        if (!this.current(generation)) return; this.cursors.set(filename, cursor);
      }
      const compressed = filename.endsWith('.zstd');
      try {
        while (cursor.offset < info.size && this.current(generation)) {
          const bytes = Buffer.alloc(Math.min(65536, info.size - cursor.offset));
          const { bytesRead } = await handle.read(bytes, 0, bytes.length, cursor.offset); if (!bytesRead) break;
          cursor.offset += bytesRead;
          if (compressed) {
            cursor.pending = Buffer.concat([cursor.pending, bytes.subarray(0, bytesRead)]);
            let size: number | null;
            while ((size = completeZstdFrame(cursor.pending)) !== null) {
              const decoded = await decompress(cursor.pending.subarray(0, size), { maxOutputLength: 64 * 1024 * 1024 });
              if (!this.current(generation)) return;
              this.consume(cursor, decoded); cursor.pending = Buffer.from(cursor.pending.subarray(size));
            }
            if (cursor.pending.length > MAX_FRAME) throw new Error('DSH 压缩帧过大，暂不支持');
          } else this.consume(cursor, bytes.subarray(0, bytesRead));
        }
        if (!this.current(generation)) return;
        cursor.anchor = await completionFileAnchor(handle, cursor.offset);
        if (cursor.prefixBytes === 0 && head.length) { cursor.prefixBytes = head.length; cursor.prefix = createHash('sha256').update(head).digest('hex'); }
        if (baseline) cursor.candidates = [];
        if (!cursor.pending.length && !cursor.line.length) {
          for (const candidate of cursor.candidates) {
            if (baseline || candidate.time <= this.armedAt || !cursor.meta?.root || (cursor.meta.seeded && (cursor.seedCut < 0 || candidate.seq <= cursor.seedCut))) continue;
            if (candidate.kind) {
              const id = createHash('sha256').update(JSON.stringify([cursor.meta.id, candidate.kind, candidate.request])).digest('hex');
              if (!this.attentionSeen.has(id)) { this.attentionSeen.add(id); this.options.onAttention?.({ id, source: 'deepseek-harness', kind: candidate.kind, occurredAt: new Date(candidate.time).toISOString() }); }
              continue;
            }
            const previous = this.completed.get(cursor.meta.id) ?? -1;
            if (candidate.turn <= previous) continue;
            this.completed.set(cursor.meta.id, candidate.turn);
            this.options.onNotice({ id: `dsh:${createHash('sha256').update(cursor.meta.id).digest('hex')}:${candidate.turn}`, completedAt: new Date(candidate.time).toISOString(), source: 'deepseek-harness' });
          }
          cursor.candidates = [];
        }
      } catch (error) { if (this.current(generation)) this.cursors.delete(filename); throw error; }
    } finally { await handle.close(); }
  }
  async drain(): Promise<void> { await Promise.allSettled([...this.active]); }
  dispose() { this.disposed = true; this.enabled = false; this.generation++; this.stop(); this.cursors.clear(); this.completed.clear(); }
}
