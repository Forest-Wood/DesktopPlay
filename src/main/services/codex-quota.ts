import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CodexQuotaBucket, CodexQuotaState, CodexQuotaWindow } from '../../shared/types';

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null; }
function string(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value : null; }
function window(value: unknown): CodexQuotaWindow | null {
  const data = record(value);
  if (!data || typeof data.usedPercent !== 'number' || !Number.isFinite(data.usedPercent) || data.usedPercent < 0) return null;
  const usedPercent = Math.max(0, Math.min(100, data.usedPercent));
  const minutes = data.windowDurationMins;
  const timestamp = data.resetsAt;
  const date = typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp >= 0 ? new Date(timestamp * 1000) : null;
  return { usedPercent, remainingPercent: 100 - usedPercent,
    windowMinutes: typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? minutes : null,
    resetsAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null };
}

/** Accept the app-server result only; unknown windows remain unknown. */
export function normalizeCodexQuota(value: unknown): CodexQuotaBucket[] {
  const result = record(value);
  if (!result) throw new Error('invalid-quota');
  const map = record(result.rateLimitsByLimitId);
  const fallback = record(result.rateLimits);
  const entries: [string, unknown][] = map && Object.keys(map).length ? Object.entries(map) : fallback ? [[string(fallback.limitId) ?? 'codex', fallback]] : [];
  if (!entries.length) throw new Error('invalid-quota');
  return entries.map(([key, raw]) => {
    const data = record(raw);
    if (!data) throw new Error('invalid-quota');
    const primary = window(data.primary), secondary = window(data.secondary);
    const credits = record(data.credits);
    const balance = credits?.balance;
    const creditsRemaining = typeof balance === 'number' && Number.isFinite(balance) && balance >= 0 ? String(balance)
      : typeof balance === 'string' && /^\d+(?:\.\d+)?$/.test(balance.trim()) ? balance.trim() : null;
    const unlimitedCredits = credits?.unlimited === true;
    // A response with no known windows or credit fields is not a successful reading.
    if (!primary && !secondary && creditsRemaining === null && !unlimitedCredits) throw new Error('invalid-quota');
    return { id: string(data.limitId) ?? key, name: string(data.limitName) ?? string(data.limitId) ?? key,
      planType: string(data.planType), primary, secondary,
      creditsRemaining, unlimitedCredits };
  });
}

async function isNativeCodexExecutable(candidate: string): Promise<boolean> {
  if (!path.isAbsolute(candidate) || path.basename(candidate).toLowerCase() !== 'codex.exe') return false;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    if (!(await fs.stat(candidate)).isFile()) return false;
    handle = await fs.open(candidate, 'r');
    const header = Buffer.alloc(2); const { bytesRead } = await handle.read(header, 0, 2, 0);
    return bytesRead === 2 && header.toString('ascii') === 'MZ';
  } catch { return false; } finally { await handle?.close(); }
}

export async function discoverCodexExecutable(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(directory.replace(/^"|"$/g, ''), 'codex.exe');
    if (await isNativeCodexExecutable(candidate)) return candidate;
  }
  // npm installs usually expose a .cmd shim. Locate its native vendor binary,
  // never execute the shim or a shell to ask npm where it was installed.
  const npmRoots = new Set((process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map(directory => directory.replace(/^"|"$/g, '')));
  if (process.env.APPDATA) npmRoots.add(path.join(process.env.APPDATA, 'npm'));
  npmRoots.add(path.dirname(process.execPath));
  const target = path.join('vendor', 'x86_64-pc-windows-msvc', 'codex', 'codex.exe');
  for (const directory of npmRoots) {
    const scope = path.join(directory, 'node_modules', '@openai');
    for (const candidate of [path.join(scope, 'codex', target), path.join(scope, 'codex-win32-x64', target), path.join(scope, 'codex', 'node_modules', '@openai', 'codex-win32-x64', target)]) {
      if (await isNativeCodexExecutable(candidate)) return candidate;
    }
  }
  if (process.env.USERPROFILE) {
    const extensions = path.join(process.env.USERPROFILE, '.vscode', 'extensions');
    try {
      const names = (await fs.readdir(extensions)).filter(name => name.startsWith('openai.chatgpt-')).sort().reverse();
      for (const name of names) {
        const candidate = path.join(extensions, name, 'bin', 'windows-x86_64', 'codex.exe');
        if (await isNativeCodexExecutable(candidate)) return candidate;
      }
    } catch { /* VS Code is optional. */ }
  }
  return null;
}

/** Read-only protocol: initialize, initialized, account/rateLimits/read. */
export function requestCodexQuota(executable: string, cwd: string, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('aborted')); return; }
    const child = spawn(executable, ['app-server'], { cwd, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', totalBytes = 0, finished = false, initialized = false;
    const complete = (error: Error | null, result?: unknown) => {
      if (finished) return; finished = true;
      signal.removeEventListener('abort', abort);
      child.stdin.end(); child.kill();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => complete(new Error('aborted'));
    signal.addEventListener('abort', abort, { once: true });
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
    child.on('error', () => complete(new Error('launch-failed')));
    child.stdin.on('error', () => complete(new Error('protocol-failed')));
    // Consume stderr without retaining or exposing messages that may contain account data.
    child.stderr.on('data', () => {});
    child.on('exit', () => complete(new Error('server-exited')));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (finished) return;
      totalBytes += Buffer.byteLength(chunk);
      if (totalBytes > 1024 * 1024) { complete(new Error('response-too-large')); return; }
      buffer += chunk;
      let newline: number;
      while (!finished && (newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let message: RecordValue | null;
        try { message = record(JSON.parse(line)); } catch { complete(new Error('invalid-protocol')); return; }
        if (!message) { complete(new Error('invalid-protocol')); return; }
        if (message.id !== 1 && message.id !== 2) continue;
        if (message.error != null || !Object.hasOwn(message, 'result')) { complete(new Error('request-failed')); return; }
        if (message.id === 1 && !initialized) {
          initialized = true;
          send({ method: 'initialized' });
          send({ id: 2, method: 'account/rateLimits/read', params: {} });
        } else if (message.id === 2 && initialized) complete(null, message.result);
        else { complete(new Error('invalid-protocol')); return; }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'desktopplay', title: 'DesktopPlay', version: '0.2.0' }, capabilities: { experimentalApi: false } } });
  });
}

export interface CodexQuotaOptions {
  cwd: string;
  executablePath?: string;
  now?: () => Date;
  discoverExecutable?: () => Promise<string | null>;
  requestRunner?: (executable: string, cwd: string, signal: AbortSignal) => Promise<unknown>;
  timeoutMs?: number;
}
export class CodexQuotaService {
  private state: CodexQuotaState = { status: 'idle', buckets: [], updatedAt: null, error: null, source: 'codex-app-server', available: false };
  private executable: string | null = null;
  private listeners = new Set<(state: CodexQuotaState) => void>();
  private inFlight: Promise<CodexQuotaState> | null = null;
  private controller: AbortController | null = null;
  private disposed = false;
  constructor(private readonly options: CodexQuotaOptions) {}
  async init(): Promise<void> {
    if (this.disposed) return;
    const configured = this.options.executablePath;
    try { this.executable = configured && await isNativeCodexExecutable(configured) ? configured : await (this.options.discoverExecutable ?? discoverCodexExecutable)(); }
    catch { this.executable = null; }
    if (this.disposed) return;
    this.update({ available: !!this.executable, status: this.executable ? 'idle' : 'unavailable', error: this.executable ? null : '未找到 Codex 程序，请安装 Codex 或选择 codex.exe。' });
  }
  getState(): CodexQuotaState { return structuredClone(this.state); }
  subscribe(fn: (state: CodexQuotaState) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  async setExecutablePath(executable: string): Promise<void> {
    if (!await isNativeCodexExecutable(executable)) throw new Error('请选择有效的原生 codex.exe。');
    if (this.disposed) return;
    this.controller?.abort();
    await this.inFlight;
    if (this.disposed) return;
    this.executable = executable;
    this.update({ status: 'idle', available: true, buckets: [], updatedAt: null, error: null });
  }
  refresh(): Promise<CodexQuotaState> {
    if (this.inFlight) return this.inFlight;
    if (this.disposed || !this.executable) return Promise.resolve(this.getState());
    const executable = this.executable;
    const controller = new AbortController(); this.controller = controller;
    this.update({ status: 'loading', error: null });
    this.inFlight = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      const cancelled = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(1, Math.min(20_000, this.options.timeoutMs ?? 15_000)));
      try {
        const result = await Promise.race([(this.options.requestRunner ?? requestCodexQuota)(executable, this.options.cwd, controller.signal), cancelled]);
        const buckets = normalizeCodexQuota(result);
        if (!this.disposed && !controller.signal.aborted) this.update({ status: 'ready', buckets, updatedAt: (this.options.now?.() ?? new Date()).toISOString(), error: null });
      } catch {
        if (!this.disposed && (this.executable === executable) && (!controller.signal.aborted || timedOut)) this.update({ status: 'error', error: timedOut ? '读取 Codex 额度超时，请稍后刷新。' : '无法读取 Codex 额度，请确认已在 Codex 登录 ChatGPT 账户后刷新。' });
      } finally { clearTimeout(timer); if (this.controller === controller) this.controller = null; this.inFlight = null; }
      return this.getState();
    })();
    return this.inFlight;
  }
  dispose(): void { this.disposed = true; this.controller?.abort(); this.listeners.clear(); }
  private update(patch: Partial<CodexQuotaState>): void { this.state = { ...this.state, ...patch }; for (const fn of this.listeners) { try { fn(this.getState()); } catch { /* A subscriber cannot disrupt quota cleanup. */ } } }
}
