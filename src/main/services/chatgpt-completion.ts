import { watch, type FSWatcher } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { completionFileAnchor } from './completion-file-anchor';
import type { CodexCompletionNotice, CodexCompletionState, ConversationNotice } from '../../shared/types';

const MAX_LINE = 64 * 1024;
const CHUNK = 64 * 1024;
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
type TurnEnd = { thread: string; turn: string; time: number; kind?: 'question' | 'approval' };
type Cursor = {
  offset: number; identity: string; modified: string; prefix: string; prefixBytes: number; anchor: string;
  decoder: StringDecoder; partial: string; discard: boolean;
};

/** Only native, user-facing Work turn notifications. Account/user fields are discarded. */
export function parseChatgptTurnEnd(line: string): TurnEnd | null {
  if (line.length > MAX_LINE || !line.includes('[desktop-notifications] forward show ')) return null;
  if (!/(?:^|\s)kind=turn-complete(?:\s|$)/.test(line)) return null;
  const match = /(?:^|\s)notificationId=turn-(\[.*\])\s*$/.exec(line);
  const time = Date.parse(line.slice(0, 24));
  if (!match || !Number.isFinite(time)) return null;
  try {
    const key: unknown = JSON.parse(match[1]);
    if (!Array.isArray(key) || key.length !== 5 || key[2] !== 'durable') return null;
    if (!key.every(value => typeof value === 'string' && value.length > 0 && value.length <= 512)) return null;
    return { thread: key[3], turn: key[4], time };
  } catch { return null; }
}

/** App Chat/Work/Codex use local/durable hosts. Parse IDs, never titles or bodies. */
export function parseChatgptAttention(line: string): TurnEnd | null {
  if (line.length > MAX_LINE || !line.includes('[desktop-notifications] forward show ')) return null;
  const kind = /(?:^|\s)kind=(question|permission)(?:\s|$)/.exec(line)?.[1];
  const id = /(?:^|\s)notificationId=(.+)\s*$/.exec(line)?.[1];
  const time = Date.parse(line.slice(0, 24));
  if (!kind || !id || id.length > 4096 || !Number.isFinite(time)) return null;
  if (kind === 'question' && id.startsWith('async-question-')) {
    try {
      const key: unknown = JSON.parse(id.slice(15));
      if (!Array.isArray(key) || key.length !== 6 || !['local', 'durable'].includes(key[2]) || !key.every(value => typeof value === 'string' && value.length > 0 && value.length <= 512)) return null;
      return { thread: `${key[2]}:${key[3]}`, turn: `question:${JSON.stringify([key[4], key[5]])}`, time, kind: 'question' };
    } catch { return null; }
  }
  const request = /^(question|approval)-(local|durable)-([^\s]{1,512})$/.exec(id);
  if (!request || request[1] !== (kind === 'question' ? 'question' : 'approval')) return null;
  return { thread: `native-request:${request[2]}`, turn: id, time, kind: kind === 'question' ? 'question' : 'approval' };
}

/** Windows Store and standalone desktop layouts; no account/configuration files are read. */
export function chatgptLogDirectories(localAppData: string): string[] {
  return [
    path.join(localAppData, 'Packages', 'OpenAI.Codex_2p2nqsd0c76g0', 'LocalCache', 'Local', 'Codex', 'Logs'),
    path.join(localAppData, 'Codex', 'Logs'),
  ];
}

interface Options {
  onNotice: (notice: CodexCompletionNotice) => void;
  onAttention?: (notice: ConversationNotice) => void;
  onState?: () => void;
  now?: () => number;
  pollMs?: number;
  watchDirectory?: typeof watch;
}

/** Native turn-ended events carry no success status; failure/interruption is intentionally included. */
export class ChatgptCompletionService {
  private state: CodexCompletionState = { status: 'disabled', directory: '', error: null, lastAttentionAt: null };
  private directories: string[] = [];
  private enabled = false;
  private scope = '';
  private disposed = false;
  private generation = 0;
  private armedAt = 0;
  private baseline = true;
  private cursors = new Map<string, Cursor>();
  private seen = new Set<string>();
  private through = new Map<string, { time: number; turns: Set<string> }>();
  private watchers = new Map<string, FSWatcher>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | null = null;
  private active = new Set<Promise<void>>();

  constructor(private readonly options: Options) {}
  getState(): CodexCompletionState { return { ...this.state }; }
  async configure(enabled: boolean, directories: string[], scope = ''): Promise<void> {
    const resolved = [...new Set(directories.map(directory => path.resolve(directory)))];
    if (this.disposed || (this.enabled === enabled && this.scope === scope && JSON.stringify(resolved) === JSON.stringify(this.directories))) return this.inFlight ?? undefined;
    this.scope = scope;
    const generation = ++this.generation;
    this.stop(); this.enabled = enabled; this.directories = resolved;
    this.cursors.clear(); this.seen.clear(); this.through.clear(); this.baseline = true;
    this.armedAt = this.options.now?.() ?? Date.now(); this.inFlight = null;
    this.update({ status: enabled ? 'starting' : 'disabled', directory: resolved.join('；'), error: null, lastAttentionAt: null });
    if (!enabled) return;
    await this.check();
    if (!this.current(generation)) return;
    this.timer = setInterval(() => { void this.check(); }, this.options.pollMs ?? 2000);
    this.timer.unref();
  }
  check(): Promise<void> {
    if (!this.enabled || this.disposed) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    const generation = this.generation;
    const job = this.scan(generation).catch(() => {
      if (this.current(generation)) this.update({ status: 'error', error: '无法读取 ChatGPT 桌面通知日志；请检查访问权限，将自动重试。' });
    }).finally(() => { this.active.delete(job); if (this.inFlight === job) this.inFlight = null; });
    this.active.add(job); this.inFlight = job;
    return job;
  }
  private current(generation: number): boolean { return this.enabled && !this.disposed && this.generation === generation; }
  private update(patch: Partial<CodexCompletionState>): void {
    const next = { ...this.state, ...patch };
    if (JSON.stringify(next) !== JSON.stringify(this.state)) { this.state = next; this.options.onState?.(); }
  }
  private stop(): void {
    clearInterval(this.timer); clearTimeout(this.debounce);
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
  }
  private attach(directory: string, generation: number): void {
    if (this.watchers.has(directory)) return;
    try {
      const watcher = (this.options.watchDirectory ?? watch)(directory, { recursive: true }, () => {
        if (!this.current(generation)) return;
        clearTimeout(this.debounce); this.debounce = setTimeout(() => { void this.check(); }, 80);
      });
      watcher.on('error', () => { watcher.close(); if (this.watchers.get(directory) === watcher) this.watchers.delete(directory); });
      watcher.unref(); this.watchers.set(directory, watcher);
    } catch { /* Size polling also recovers lost/unsupported recursive notifications. */ }
  }
  private async scan(generation: number): Promise<void> {
    const files = new Set<string>();
    const events: TurnEnd[] = [];
    let available = false, failed = false;
    const visit = async (directory: string, depth: number): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (!this.current(generation)) return;
        const filename = path.join(directory, entry.name);
        try {
          if (entry.isDirectory() && depth < 4) await visit(filename, depth + 1);
          else if (entry.isFile() && entry.name.endsWith('.log')) {
            files.add(filename); await this.read(filename, generation, events);
          }
        } catch (error) { if (!missing(error)) failed = true; }
      }
    };
    for (const directory of this.directories) {
      if (!this.current(generation)) return;
      try {
        if (!(await stat(directory)).isDirectory()) continue;
        if (!this.current(generation)) return;
        available = true; this.attach(directory, generation); await visit(directory, 0);
      } catch (error) {
        if (!this.current(generation)) return;
        if (!missing(error)) failed = true;
        this.watchers.get(directory)?.close(); this.watchers.delete(directory);
      }
    }
    if (!this.current(generation)) return;
    // File enumeration order must not drop an earlier turn in another active log.
    for (const event of events.sort((a, b) => a.time - b.time)) {
      if (!this.current(generation)) return;
      this.consume(event);
    }
    for (const filename of this.cursors.keys()) if (!files.has(filename)) this.cursors.delete(filename);
    this.baseline = false;
    this.update(failed ? { status: 'error', error: '部分 ChatGPT 桌面通知日志无法读取；将自动重试。' }
      : { status: available ? 'watching' : 'unavailable', error: null });
  }
  private async read(filename: string, generation: number, events: TurnEnd[]): Promise<void> {
    const info = await stat(filename);
    if (!this.current(generation) || !info.isFile()) return;
    const identity = `${info.ino}:${info.birthtimeMs}`, modified = `${info.mtimeMs}:${info.ctimeMs}`;
    const previous = this.cursors.get(filename);
    // Windows held-open writers may preserve timestamps, even on equal-length rewrites.
    const handle = await open(filename, 'r');
    try {
      const head = Buffer.alloc(256);
      const { bytesRead: headSize } = await handle.read(head, 0, head.length, 0);
      const prefixBytes = previous ? Math.min(previous.prefixBytes, headSize) : headSize;
      const prefix = createHash('sha256').update(head.subarray(0, prefixBytes)).digest('hex');
      const anchor = await completionFileAnchor(handle, Math.min(previous?.offset ?? 0, info.size));
      if (!this.current(generation)) return;
      let cursor = this.cursors.get(filename);
      if (!cursor || cursor.identity !== identity || cursor.offset > info.size || cursor.prefix !== prefix || cursor.anchor !== anchor) {
        const tail = Buffer.alloc(1);
        if (this.baseline && info.size) await handle.read(tail, 0, 1, info.size - 1);
        cursor = { offset: this.baseline ? info.size : 0, identity, modified, prefix, prefixBytes, anchor: await completionFileAnchor(handle, this.baseline ? info.size : 0),
          decoder: new StringDecoder('utf8'), partial: '', discard: this.baseline && info.size > 0 && tail[0] !== 10 };
        if (!this.current(generation)) return;
        this.cursors.set(filename, cursor);
      }
      cursor.modified = modified;
      if (cursor.prefixBytes === 0 && headSize > 0) {
        cursor.prefixBytes = headSize; cursor.prefix = createHash('sha256').update(head.subarray(0, headSize)).digest('hex');
      }
      while (cursor.offset < info.size && this.current(generation)) {
        const chunk = Buffer.alloc(Math.min(CHUNK, info.size - cursor.offset));
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, cursor.offset);
        if (!bytesRead) break;
        if (!this.current(generation)) return;
        cursor.offset += bytesRead;
        const data = cursor.decoder.write(chunk.subarray(0, bytesRead));
        let start = 0, newline: number;
        while ((newline = data.indexOf('\n', start)) >= 0) {
          const part = data.slice(start, newline);
          if (!cursor.discard && cursor.partial.length + part.length <= MAX_LINE) {
            const event = parseChatgptTurnEnd(cursor.partial + part) ?? parseChatgptAttention(cursor.partial + part);
            if (event) events.push(event);
          }
          cursor.partial = ''; cursor.discard = false; start = newline + 1;
        }
        if (!cursor.discard) {
          cursor.partial += data.slice(start);
          if (cursor.partial.length > MAX_LINE) { cursor.partial = ''; cursor.discard = true; }
        }
      }
      if (this.current(generation)) cursor.anchor = await completionFileAnchor(handle, cursor.offset);
    } finally { await handle.close(); }
  }
  private consume(event: TurnEnd): void {
    if (event.time < this.armedAt) return;
    const id = `chatgpt-work:${JSON.stringify([event.thread, event.turn])}`;
    const previous = this.through.get(event.thread);
    if (this.seen.has(id) || (previous && (event.time < previous.time || (event.time === previous.time && previous.turns.has(event.turn))))) return;
    const through = previous?.time === event.time ? previous : { time: event.time, turns: new Set<string>() };
    through.turns.add(event.turn); this.through.set(event.thread, through); this.seen.add(id);
    if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value!);
    try {
      if (event.kind) {
        const occurredAt = new Date(event.time).toISOString();
        this.update({ lastAttentionAt: occurredAt });
        this.options.onAttention?.({ id: createHash('sha256').update(id).digest('hex'), source: 'chatgpt-work', kind: event.kind, occurredAt });
      }
      else this.options.onNotice({ id, source: 'chatgpt-work', completedAt: new Date(event.time).toISOString() });
    }
    catch { /* A consumer error must not stop monitoring. */ }
  }
  async drain(): Promise<void> { await Promise.all(this.active); }
  dispose(): void { this.disposed = true; this.enabled = false; this.generation++; this.stop(); this.cursors.clear(); this.seen.clear(); this.through.clear(); }
}
