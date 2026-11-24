import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { emptyGeminiQuota, GEMINI_WINDOWS } from '../../shared/gemini';
import type { GeminiQuotaState } from '../../shared/types';

const exec = promisify(execFile);
const record = (item: unknown): Record<string, unknown> => item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {};
function parseQuota(payload: unknown) {
  const root = record(payload), command = record(root.command);
  if (root.command && (root.status !== 'SUCCESS' || command.name !== 'usage')) throw new Error('agy 未返回成功的 /usage 报告。');
  const summary = record(command.data ?? root.response ?? root.summary ?? root);
  if (!Array.isArray(summary.groups) || !summary.groups.length) throw new Error('Antigravity 尚未返回额度窗口，请稍后刷新。');
  const windows: GeminiQuotaState['windows'] = {};
  for (const group of summary.groups.map(record)) {
    if (!Array.isArray(group.buckets)) continue;
    for (const bucket of group.buckets.map(record)) {
      const match = GEMINI_WINDOWS.find(([key]) => key === (bucket.bucketId ?? bucket.bucket_id ?? bucket.id));
      if (!match || bucket.disabled === true) continue;
      const [key] = match, nested = record(bucket.remaining);
      const value = bucket.remainingFraction ?? bucket.remaining_fraction ?? nested.remainingFraction ?? (nested.case === 'remainingFraction' ? nested.value : null);
      const reset = bucket.resetTime ?? bucket.reset_time;
      windows[key] = {
        remainingPercent: typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value * 100 : null,
        resetsAt: typeof reset === 'string' && Number.isFinite(Date.parse(reset)) ? new Date(reset).toISOString() : null,
      };
    }
  }
  // Only report a plan when the quota response includes dedicated plan metadata.
  const planName = [summary.planName, summary.plan_name, record(summary.paidTier).displayName, record(summary.userTier).name]
    .find((value): value is string => typeof value === 'string' && !!value.trim() && value.length <= 80 && !/[\u0000-\u001f\u007f]/.test(value))?.trim();
  return { windows, ...(planName ? { planName } : {}) };
}

export function quotaWindows(payload: unknown): GeminiQuotaState['windows'] {
  return parseQuota(payload).windows;
}

// Only address the loopback listener owned by the PID in the client's own discovery file.
export async function readLocalQuota(home: string): Promise<unknown> {
  const files: string[] = [];
  for (const client of ['antigravity', 'antigravity-ide', 'antigravity-cli']) {
    const daemon = path.join(home, client, 'daemon');
    const names = await readdir(daemon).catch(() => [] as string[]);
    for (const name of names) if (/^hub_\d+\.json$/.test(name)) files.push(path.join(daemon, name));
  }
  if (!files.length) throw new Error('未发现 Antigravity 客户端。');
  const { stdout } = await exec(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'netstat.exe'), ['-ano', '-p', 'tcp'], { windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
  const owners = new Set(stdout.split(/\r?\n/).flatMap(line => {
    const m = /^\s*TCP\s+127\.0\.0\.1:(\d+)\s+0\.0\.0\.0:0\s+\S+\s+(\d+)\s*$/.exec(line);
    return m ? [m[1] + '/' + m[2]] : [];
  }));
  for (const file of files) {
    try {
      const info = JSON.parse(await readFile(file, 'utf8'));
      if (!Number.isInteger(info.httpPort) || !Number.isInteger(info.pid) || !owners.has(info.httpPort + '/' + info.pid) || typeof info.csrfToken !== 'string') continue;
      const res = await fetch('http://127.0.0.1:' + info.httpPort + '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary', {
        method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'connect-protocol-version': '1', 'x-codeium-csrf-token': info.csrfToken },
        body: JSON.stringify({ forceRefresh: true }), signal: AbortSignal.timeout(5000),
      });
      if (res.ok) { const data: unknown = await res.json(); quotaWindows(data); return data; }
    } catch { /* An old daemon may have exited or lack quota summaries. */ }
  }
  throw new Error('未发现可读取额度的 Antigravity 客户端。');
}

export async function readCliQuota(home: string): Promise<unknown> {
  const candidates = [path.join(home, 'bin'), ...(process.env.PATH ?? '').split(path.delimiter).filter(path.isAbsolute)];
  let executable: string | undefined;
  for (const folder of candidates) {
    const file = path.join(folder, 'agy.exe');
    try { await access(file); executable = file; break; } catch { /* Continue discovery. */ }
  }
  if (!executable) throw new Error('请打开 Antigravity，或安装并登录 agy 以在客户端关闭后查询。');
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'DesktopPet-usage-'));
  const options = { cwd, windowsHide: true, maxBuffer: 1024 * 1024, env: { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE: 'true', NO_BROWSER: '1' } };
  try {
    const version = (await exec(executable, ['--version'], { ...options, timeout: 5000 })).stdout.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
    if (!version) throw new Error('version');
    const [major, minor, patch] = version.slice(1).map(Number);
    if (major < 1 || (major === 1 && (minor < 1 || (minor === 1 && patch < 11)))) throw new Error('version');
    const { stdout } = await exec(executable, ['-p', '/usage', '--output-format', 'json'], { ...options, timeout: 45000 });
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(error instanceof Error && error.message === 'version' ? '请升级 agy 至 1.1.11 或更新版本。' : 'agy 查询失败，请在终端登录并运行 /usage 后刷新。');
  } finally { await rm(cwd, { recursive: true, force: true }); }
}

export class GeminiQuotaService {
  private state = emptyGeminiQuota();
  private inflight?: Promise<void>;
  constructor(private local: () => Promise<unknown>, private cli: () => Promise<unknown>, private publish: () => void) {}
  getState() { return structuredClone(this.state); }
  refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.state = { ...this.state, status: 'loading', error: null };
    this.inflight = this.read().finally(() => { this.inflight = undefined; this.publish(); });
    this.publish();
    return this.inflight;
  }
  private async read() {
    try {
      let quota: ReturnType<typeof parseQuota>;
      try { quota = parseQuota(await this.local()); } catch { quota = parseQuota(await this.cli()); }
      this.state = { ...quota, status: 'ready', error: null, updatedAt: new Date().toISOString() };
    } catch (error) { this.state = { ...this.state, status: 'error', error: error instanceof Error ? error.message : '请重新打开 Antigravity 后刷新。' }; }
  }
  drain() { return this.inflight ?? Promise.resolve(); }
}
