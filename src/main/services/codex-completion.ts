import { watch, type FSWatcher } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import type { CodexCompletionNotice, CodexCompletionState } from '../../shared/types';

const MAX_LINE = 1024 * 1024;
const CHUNK = 64 * 1024;
type Meta = { id: string; root: boolean };
type Cursor = {
  offset: number; identity: string; modified: string; prefix: string; prefixBytes: number; meta: Meta | null;
  decoder: StringDecoder; partial: string; discard: boolean;
};
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string | null => typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : null;
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

/** Read only session metadata, never retain instructions or conversation fields. */
function metadata(line: string): Meta | null {
  try {
    const row = object(JSON.parse(line)), data = object(row?.payload);
    if (row?.type !== 'session_meta' || !data || !text(data.id)) return null;
    const source = data.source;
    const custom = object(source);
    const customRoot = custom && Object.keys(custom).length === 1 && typeof custom.custom === 'string';
    const nonRoot = !!data.parent_thread_id || (source !== undefined && typeof source !== 'string' && !customRoot)
      || (typeof source === 'string' && /^(subagent|internal|guardian|memory)/i.test(source))
      || (typeof data.thread_source === 'string' && data.thread_source !== 'user');
    return { id: data.id as string, root: !nonRoot };
  } catch { return null; }
}

export interface CodexCompletionOptions {
  onNotice: (notice: CodexCompletionNotice) => void;
  onState?: () => void;
  now?: () => number;
  pollMs?: number;
  watchDirectory?: typeof watch;
}

/** Watches local rollout events. Never starts Codex, reads auth, or rewrites its config. */
export class CodexCompletionService {
  private state: CodexCompletionState = { status: 'disabled', directory: '', error: null };
  private generation = 0;
  private armedAt = 0;
  private enabled = false;
  private disposed = false;
  private baseline = false;
  private cursors = new Map<string, Cursor>();
  private seen = new Set<string>();
  private completedThrough = new Map<string, { time: number; ids: Set<string> }>();
  private watcher: FSWatcher | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | null = null;
  private active = new Set<Promise<void>>();

  constructor(private readonly options: CodexCompletionOptions) {}
  getState(): CodexCompletionState { return { ...this.state }; }
  async configure(enabled: boolean, directory: string): Promise<void> {
    directory = path.resolve(directory);
    if (this.disposed || (this.enabled === enabled && this.state.directory === directory)) return this.inFlight ?? undefined;
    const generation = ++this.generation;
    this.stopTimers(); this.enabled = enabled;
    this.cursors.clear(); this.seen.clear(); this.completedThrough.clear(); this.baseline = true;
    this.armedAt = this.now(); this.inFlight = null;
    this.update({ directory, status: enabled ? 'starting' : 'disabled', error: null });
    if (!enabled) return;
    await this.check();
    if (!this.current(generation)) return;
    this.timer = setInterval(() => { void this.check(); }, this.options.pollMs ?? 2000);
    this.timer.unref();
  }

  /** Also provides deterministic recovery when native change notifications are lost. */
  check(): Promise<void> {
    if (!this.enabled || this.disposed) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    const generation = this.generation;
    const job = this.scan(generation).catch(() => {
      if (this.current(generation)) this.update({ status: 'error', error: '无法读取会话事件，请检查目录访问权限；将自动重试。' });
    }).finally(() => { this.active.delete(job); if (this.inFlight === job) this.inFlight = null; });
    this.inFlight = job;
    this.active.add(job);
    return job;
  }

  private now(): number { return this.options.now?.() ?? Date.now(); }
  private current(generation: number): boolean { return !this.disposed && this.enabled && generation === this.generation; }
  private update(patch: Partial<CodexCompletionState>): void {
    const next = { ...this.state, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.state)) return;
    this.state = next; this.options.onState?.();
  }
  private stopTimers(): void {
    clearInterval(this.timer); clearTimeout(this.debounce);
    this.timer = undefined; this.debounce = undefined;
    this.watcher?.close(); this.watcher = null;
  }
  private attachWatcher(directory: string, generation: number): void {
    if (this.watcher) return;
    try {
      const watcher = (this.options.watchDirectory ?? watch)(directory, { recursive: true }, () => {
        if (!this.current(generation)) return;
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => { void this.check(); }, 80);
      });
      this.watcher = watcher;
      watcher.on('error', () => { watcher.close(); if (this.watcher === watcher) this.watcher = null; });
      watcher.unref();
    } catch { /* Polling remains active if recursive watching is unavailable. */ }
  }

  private async scan(generation: number): Promise<void> {
    const directory = path.join(this.state.directory, 'sessions');
    try { if (!(await stat(directory)).isDirectory()) throw new Error('not-directory'); }
    catch (error) {
      if (!this.current(generation)) return;
      if (!missing(error)) throw error;
      this.watcher?.close(); this.watcher = null;
      // A directory created later is a new source, not old history to replay.
      this.baseline = false;
      this.update({ status: 'unavailable', error: '未找到 sessions 目录；等待本机 Codex 保存会话事件。' });
      return;
    }
    if (!this.current(generation)) return;
    this.attachWatcher(directory, generation);
    const files = new Set<string>();
    const visit = async (folder: string): Promise<void> => {
      if (!this.current(generation)) return;
      let entries;
      try { entries = await readdir(folder, { withFileTypes: true }); } catch (error) { if (missing(error)) return; throw error; }
      for (const entry of entries) {
        if (!this.current(generation)) return;
        const filename = path.join(folder, entry.name);
        if (entry.isDirectory()) await visit(filename);
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          files.add(filename);
          try { await this.read(filename, generation, this.baseline); } catch (error) { if (!missing(error)) throw error; }
        }
      }
    };
    await visit(directory);
    if (!this.current(generation)) return;
    for (const filename of this.cursors.keys()) if (!files.has(filename)) this.cursors.delete(filename);
    this.baseline = false;
    this.update({ status: 'watching', error: null });
  }

  private async read(filename: string, generation: number, baseline: boolean): Promise<void> {
    const info = await stat(filename);
    if (!this.current(generation) || !info.isFile()) return;
    const identity = `${info.ino}:${info.birthtimeMs}`, modified = `${info.mtimeMs}:${info.ctimeMs}`;
    const previous = this.cursors.get(filename);
    if (previous && previous.identity === identity && previous.offset === info.size && previous.modified === modified) return;
    const handle = await open(filename, 'r');
    try {
      const head = Buffer.alloc(256);
      const { bytesRead: headSize } = await handle.read(head, 0, head.length, 0);
      const prefixBytes = previous ? Math.min(previous.prefixBytes, headSize) : headSize;
      const prefix = createHash('sha256').update(head.subarray(0, prefixBytes)).digest('hex');
      if (!this.current(generation)) return;
      let cursor = this.cursors.get(filename);
      if (!cursor || cursor.identity !== identity || cursor.offset > info.size || cursor.prefix !== prefix) {
        const tail = Buffer.alloc(1);
        if (baseline && info.size) await handle.read(tail, 0, 1, info.size - 1);
        cursor = { offset: baseline ? info.size : 0, identity, modified, prefix, prefixBytes, meta: null, decoder: new StringDecoder('utf8'), partial: '', discard: baseline && info.size > 0 && tail[0] !== 10 };
        if (!this.current(generation)) return;
        this.cursors.set(filename, cursor);
      }
      cursor.modified = modified;
      if (cursor.offset === info.size) return;
      // Empty files can be discovered before Codex writes metadata.
      if (cursor.prefixBytes === 0 && headSize > 0) {
        cursor.prefixBytes = headSize;
        cursor.prefix = createHash('sha256').update(head.subarray(0, headSize)).digest('hex');
      }
      if (!cursor.meta) {
        let firstLine = '';
        for (let position = 0; position < Math.min(info.size, MAX_LINE); position += CHUNK) {
          const chunk = Buffer.alloc(Math.min(CHUNK, info.size - position));
          const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
          if (!bytesRead) break;
          firstLine += chunk.subarray(0, bytesRead).toString('utf8');
          const newline = firstLine.indexOf('\n');
          if (newline >= 0) { cursor.meta = metadata(firstLine.slice(0, newline)); break; }
        }
      }
      while (cursor.offset < info.size && this.current(generation)) {
        const chunk = Buffer.alloc(Math.min(CHUNK, info.size - cursor.offset));
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, cursor.offset);
        if (!bytesRead) break;
        cursor.offset += bytesRead;
        const data = cursor.decoder.write(chunk.subarray(0, bytesRead));
        let start = 0, newline: number;
        while ((newline = data.indexOf('\n', start)) >= 0) {
          const part = data.slice(start, newline);
          if (!cursor.discard && cursor.partial.length + part.length <= MAX_LINE) this.consume(cursor, cursor.partial + part);
          cursor.partial = ''; cursor.discard = false; start = newline + 1;
        }
        if (!cursor.discard) {
          cursor.partial += data.slice(start);
          if (cursor.partial.length > MAX_LINE) { cursor.partial = ''; cursor.discard = true; }
        }
      }
    } finally { await handle.close(); }
  }

  private consume(cursor: Cursor, line: string): void {
    try {
      const row = object(JSON.parse(line));
      if (row?.type === 'session_meta') { cursor.meta = metadata(line); return; }
      if (!cursor.meta?.root || row?.type !== 'event_msg') return;
      const payload = object(row.payload), turn = text(payload?.turn_id);
      if (!payload || !turn) return;
      const key = `${cursor.meta.id}:${turn}`;
      if (payload.type === 'turn_aborted' || payload.type === 'error') { this.remember(key); return; }
      if (payload.type !== 'task_complete' && payload.type !== 'turn_complete') return;
      const timestamp = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN;
      if (!Number.isFinite(timestamp) || timestamp < this.armedAt || this.seen.has(key)) return;
      const previous = this.completedThrough.get(cursor.meta.id);
      if (previous && (timestamp < previous.time || (timestamp === previous.time && previous.ids.has(turn)))) return;
      const through = previous && timestamp === previous.time ? previous : { time: timestamp, ids: new Set<string>() };
      through.ids.add(turn); this.completedThrough.set(cursor.meta.id, through);
      this.remember(key);
      if (payload.error != null || (payload.status != null && payload.status !== 'completed' && payload.status !== 'success')) return;
      this.options.onNotice({ id: key, completedAt: new Date(timestamp).toISOString() });
    } catch { /* Malformed lines and consumer errors cannot stop monitoring. */ }
  }
  private remember(key: string): void {
    this.seen.add(key);
    if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value!);
  }
  async drain(): Promise<void> { await Promise.all(this.active); }
  dispose(): void { this.disposed = true; this.generation++; this.enabled = false; this.stopTimers(); this.cursors.clear(); this.seen.clear(); this.completedThrough.clear(); }
}
