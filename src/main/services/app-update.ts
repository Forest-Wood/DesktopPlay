import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import { initialUpdateState } from '../../shared/app-update';
import type { AppUpdateState } from '../../shared/types';

export interface UpdateCandidate { version: string; notes: string; date: string | null }
export interface UpdateProgress { transferred: number; total: number }
export interface PreparedUpdate { commit(): Promise<void>; cancel(): Promise<void> }
export interface UpdateBackend {
  check(signal: AbortSignal): Promise<UpdateCandidate | null>;
  download(progress: (value: UpdateProgress) => void, signal: AbortSignal): Promise<void>;
  prepareInstall(): Promise<PreparedUpdate>;
}
interface Options {
  version: string; kind: AppUpdateState['kind']; dataDir: string; backend?: UpdateBackend;
  onState?: () => void; onAvailable?: (version: string) => void; now?: () => number;
  startupMs?: number; intervalMs?: number;
}
const INTERVAL = 6 * 60 * 60 * 1000;
export function stableVersion(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 100) return null;
  const parsed = semver.valid(value.replace(/^v/, ''));
  return parsed && semver.prerelease(parsed) === null ? parsed : null;
}
/** Failures are intentionally translated here: never expose signed download URLs or raw errors. */
export function updateError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'UPDATE_CHECKSUM') return '更新文件校验失败，已保留当前版本，请重试下载。';
  if (code === 'UPDATE_ASSETS') return '该版本的更新资源尚未准备完整，请稍后重试。';
  if (code === 'UPDATE_RATE_LIMIT') return 'GitHub 暂时限制请求，请稍后重试。';
  if (code === 'UPDATE_PERMISSION') return '无法在当前程序目录准备更新，请检查写入权限；当前版本仍可使用。';
  if (code === 'UPDATE_HELPER') return '更新助手未能就绪，当前程序未退出，请重试。';
  return '检查或下载更新失败，请检查网络及可用磁盘空间后重试。';
}
export class AppUpdateService {
  private state: AppUpdateState;
  private auto = false;
  private disposed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private checking: Promise<AppUpdateState> | null = null;
  private downloading: Promise<AppUpdateState> | null = null;
  private controller: AbortController | null = null;
  private candidate: UpdateCandidate | null = null;
  private notified = new Set<string>();
  private writes: Promise<void> = Promise.resolve();
  private readonly file: string;
  constructor(private readonly options: Options) {
    this.state = initialUpdateState(options.backend ? options.kind : 'unsupported', options.version);
    this.file = path.join(options.dataDir, 'update-state.json');
  }
  getState(): AppUpdateState { return { ...this.state }; }
  get busy(): boolean { return Boolean(this.checking || this.downloading || this.state.status === 'installing'); }
  private now(): number { return this.options.now?.() ?? Date.now(); }
  private set(patch: Partial<AppUpdateState>): void { this.state = { ...this.state, ...patch }; this.options.onState?.(); }
  async init(): Promise<void> {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'));
      if (typeof saved.checkedAt === 'string' && Number.isFinite(Date.parse(saved.checkedAt)) && Date.parse(saved.checkedAt) <= this.now()) this.state.checkedAt = saved.checkedAt;
      for (const value of Array.isArray(saved.notified) ? saved.notified : [saved.notified]) { const version = stableVersion(value); if (version) this.notified.add(version); }
    } catch { /* Missing or invalid cache does not affect user settings. */ }
  }
  configure(enabled: boolean): void {
    if (this.auto === enabled || this.disposed) return;
    this.auto = enabled; clearTimeout(this.timer);
    if (enabled && this.options.backend) this.schedule(this.options.startupMs ?? 30000);
  }
  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      if (!this.auto || this.disposed) return;
      const interval = this.options.intervalMs ?? INTERVAL;
      void this.check(false); this.schedule(interval);
    }, delay);
    this.timer.unref?.();
  }
  private persist(): Promise<void> {
    const data = JSON.stringify({ checkedAt: this.state.checkedAt, notified: [...this.notified] });
    this.writes = this.writes.catch(() => {}).then(async () => {
      await mkdir(this.options.dataDir, { recursive: true });
      await writeFile(`${this.file}.tmp`, data, { mode: 0o600 }); await rename(`${this.file}.tmp`, this.file);
    });
    return this.writes;
  }
  check(manual = true): Promise<AppUpdateState> {
    if (this.disposed || !this.options.backend || this.downloading || ['ready', 'installing'].includes(this.state.status)) return Promise.resolve(this.getState());
    if (this.checking) return this.checking;
    const controller = new AbortController(); this.controller = controller;
    this.set({ status: 'checking', error: null });
    const job = (async () => {
      try {
        const next = await this.options.backend!.check(controller.signal);
        if (this.disposed) return this.getState();
        const version = stableVersion(next?.version);
        this.candidate = next && version && semver.gt(version, this.options.version) ? { ...next, version } : null;
        this.set({ status: this.candidate ? 'available' : 'current', latestVersion: this.candidate?.version ?? null,
          releaseNotes: this.candidate?.notes.slice(0, 20000) ?? '', releaseDate: this.candidate?.date ?? null, checkedAt: new Date(this.now()).toISOString(), progress: 0, transferred: 0, total: 0 });
        const notify = this.candidate && !this.notified.has(this.candidate.version);
        if (notify) this.notified.add(this.candidate!.version);
        await this.persist();
        if (notify && !manual && this.auto && !this.disposed) this.options.onAvailable?.(this.candidate!.version);
      } catch (error) { this.candidate = null; if (!this.disposed) this.set({ status: 'error', latestVersion: null, releaseNotes: '', releaseDate: null, error: updateError(error) }); }
      return this.getState();
    })().finally(() => { if (this.checking === job) this.checking = null; if (this.controller === controller) this.controller = null; });
    this.checking = job; return job;
  }
  download(): Promise<AppUpdateState> {
    if (this.downloading) return this.downloading;
    if (this.disposed || !this.options.backend || !this.candidate || !['available', 'error'].includes(this.state.status)) return Promise.resolve(this.getState());
    const controller = new AbortController(); this.controller = controller;
    this.set({ status: 'downloading', error: null, progress: 0, transferred: 0, total: 0 });
    const job = (async () => {
      try {
        await this.options.backend!.download(value => {
          if (!this.disposed && !controller.signal.aborted) this.set({ ...value, progress: value.total > 0 ? Math.min(100, value.transferred / value.total * 100) : 0 });
        }, controller.signal);
        if (!this.disposed && !controller.signal.aborted) this.set({ status: 'ready', progress: 100 });
      } catch (error) { if (!this.disposed) this.set(controller.signal.aborted ? { status: 'available', error: null, progress: 0 } : { status: 'error', error: updateError(error) }); }
      return this.getState();
    })().finally(() => { if (this.downloading === job) this.downloading = null; if (this.controller === controller) this.controller = null; });
    this.downloading = job; return job;
  }
  async cancelDownload(): Promise<AppUpdateState> { if (this.downloading) { this.controller?.abort(); await this.downloading; } return this.getState(); }
  async prepareInstall(): Promise<PreparedUpdate> {
    if (this.disposed || this.busy || this.state.status !== 'ready' || !this.options.backend) throw new Error('请先完成更新下载。');
    this.set({ status: 'installing', error: null });
    try { return await this.options.backend.prepareInstall(); }
    catch (error) { this.set({ status: 'error', error: updateError(error) }); throw new Error(this.state.error!); }
  }
  installCancelled(): void { if (!this.disposed) this.set({ status: 'ready', error: null }); }
  reportRecovery(): void { this.set({ status: 'error', error: '上次免安装更新未能确认启动成功。旧程序或备份已保留，请重新检查更新；若新版仍在运行，请先正常退出后再处理备份。' }); }
  async drain(): Promise<void> { await Promise.allSettled([this.checking, this.downloading, this.writes]); }
  dispose(): void { this.disposed = true; this.auto = false; clearTimeout(this.timer); this.controller?.abort(); }
}
