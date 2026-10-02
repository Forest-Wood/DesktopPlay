import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CodexQuotaBucket, CodexQuotaState, CodexQuotaWindow } from '../../shared/types';
import { APP_VERSION } from '../../shared/defaults';

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null; }
function string(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
/** Return only the subscription name; account identity never leaves this module. */
export function quotaPlanType(value: unknown): string | null {
  const result = record(value);
  if (!result) return null;
  const buckets = record(result.rateLimitsByLimitId);
  return string(result.planType) ?? string(record(result.rateLimits)?.planType)
    ?? string(record(buckets?.codex)?.planType)
    ?? Object.values(buckets ?? {}).map(bucket => string(record(bucket)?.planType)).find(Boolean) ?? null;
}
export function accountPlanType(value: unknown): string | null {
  return string(record(record(value)?.account)?.planType);
}
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

/** Read-only protocol; account/read is a bounded fallback for missing plan data. */
export function requestCodexQuota(executable: string, cwd: string, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('aborted')); return; }
    const child = spawn(executable, ['app-server'], { cwd, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', totalBytes = 0, finished = false, initialized = false;
    let quotaResult: RecordValue | null = null;
    let accountTimer: ReturnType<typeof setTimeout> | undefined;
    const complete = (error: Error | null, result?: unknown) => {
      if (finished) return; finished = true;
      clearTimeout(accountTimer);
      signal.removeEventListener('abort', abort);
      child.stdin.end(); child.kill();
      if (error && !quotaResult) reject(error); else resolve(error ? quotaResult : result);
    };
    const abort = () => quotaResult ? complete(null, quotaResult) : complete(new Error('aborted'));
    signal.addEventListener('abort', abort, { once: true });
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
    child.on('error', () => complete(new Error('launch-failed')));
    child.stdin.on('error', () => complete(new Error('protocol-failed')));
    // Consume stderr without retaining or exposing messages that may contain account data.
    child.stderr.on('data', () => {});
    child.on('exit', () => quotaResult ? complete(null, quotaResult) : complete(new Error('server-exited')));
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
        if (message.id !== 1 && message.id !== 2 && message.id !== 3) continue;
        if (message.id === 3 && quotaResult) {
          const planType = message.error == null ? accountPlanType(message.result) : null;
          complete(null, planType ? { ...quotaResult, planType } : quotaResult); return;
        }
        if (message.error != null || !Object.hasOwn(message, 'result')) { complete(new Error('request-failed')); return; }
        if (message.id === 1 && !initialized) {
          initialized = true;
          send({ method: 'initialized' });
          send({ id: 2, method: 'account/rateLimits/read', params: {} });
        } else if (message.id === 2 && initialized) {
          try { normalizeCodexQuota(message.result); } catch { complete(new Error('invalid-quota')); return; }
          if (quotaPlanType(message.result)) { complete(null, message.result); return; }
          quotaResult = record(message.result);
          accountTimer = setTimeout(() => complete(null, quotaResult), 1500);
          send({ id: 3, method: 'account/read', params: { refreshToken: false } });
        }
        else { complete(new Error('invalid-protocol')); return; }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'desktopplay', title: 'DesktopPet', version: APP_VERSION }, capabilities: { experimentalApi: false } } });
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
  private state: CodexQuotaState = { planType: null, status: 'idle', buckets: [], updatedAt: null, error: null, source: 'codex-app-server', available: false };
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
    this.update({ status: 'idle', available: true, planType: null, buckets: [], updatedAt: null, error: null });
  }
  refresh(): Promise<CodexQuotaState> {
    if (this.inFlight) return this.inFlight;
    if (this.disposed || this.paused || !this.executable) return Promise.resolve(this.getState());
    const executable = this.executable;
    const controller = new AbortController(); this.controller = controller;
    this.update({ status: 'loading', error: null });
    this.inFlight = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      // The native reader settles on abort and may already hold valid quota while
      // waiting on optional account metadata. Only injected runners need a race.
      const cancelled = this.options.requestRunner ? new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) : null;
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(1, Math.min(20_000, this.options.timeoutMs ?? 15_000)));
      try {
        const request = (this.options.requestRunner ?? requestCodexQuota)(executable, this.options.cwd, controller.signal);
        const result = await (cancelled ? Promise.race([request, cancelled]) : request);
        const buckets = normalizeCodexQuota(result);
        if (!this.disposed && this.executable === executable && (!controller.signal.aborted || timedOut)) this.update({ status: 'ready', planType: quotaPlanType(result), buckets, updatedAt: (this.options.now?.() ?? new Date()).toISOString(), error: null });
      } catch {
        if (!this.disposed && (this.executable === executable) && (!controller.signal.aborted || timedOut)) this.update({ status: 'error', error: timedOut ? '读取 Codex 额度超时，请稍后刷新。' : '无法读取 Codex 额度，请确认已在 Codex 登录 ChatGPT 账户后刷新。' });
      } finally { clearTimeout(timer); if (this.controller === controller) this.controller = null; this.inFlight = null; }
      return this.getState();
    })();
    return this.inFlight;
  }
  private paused = false;
  pause(): void { this.paused = true; this.controller?.abort(); }
  resume(): void { this.paused = false; if (!this.disposed && this.state.status === 'loading') this.update({ status: this.state.buckets.length ? 'ready' : this.executable ? 'idle' : 'unavailable' }); }
  async drain(): Promise<void> { await this.inFlight?.catch(() => {}); }
  dispose(): void { this.disposed = true; this.pause(); this.listeners.clear(); }
  private update(patch: Partial<CodexQuotaState>): void { this.state = { ...this.state, ...patch }; for (const fn of this.listeners) { try { fn(this.getState()); } catch { /* A subscriber cannot disrupt quota cleanup. */ } } }
}
