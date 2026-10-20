import { NsisUpdater } from 'electron-updater';
import type { UpdateCheckResult } from 'electron-updater';
import { fileDigest, plainPath, updateFailure } from './update-files';
import { stableVersion, type PreparedUpdate, type UpdateBackend, type UpdateCandidate, type UpdateProgress } from './app-update';

export class InstalledUpdateBackend implements UpdateBackend {
  private readonly updater: NsisUpdater;
  private result: UpdateCheckResult | null = null;
  private file: string | null = null;
  constructor(updater?: NsisUpdater) {
    this.updater = updater ?? new NsisUpdater({ provider: 'github', owner: 'Forest-Wood', repo: 'DesktopPlay', private: false });
    this.updater.autoDownload = false; this.updater.autoInstallOnAppQuit = false;
    this.updater.allowPrerelease = false; this.updater.allowDowngrade = false; this.updater.disableDifferentialDownload = true;
    this.updater.logger = null;
    // The service translates operation failures; an EventEmitter error must not crash Electron.
    this.updater.on('error', () => {});
  }
  async check(signal: AbortSignal): Promise<UpdateCandidate | null> {
    signal.throwIfAborted(); this.result = await this.updater.checkForUpdates(); signal.throwIfAborted(); this.file = null;
    const info = this.result?.updateInfo, version = stableVersion(info?.version);
    if (!info || !version) return null;
    const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : (info.releaseNotes ?? []).map(n => n.note).join('\n');
    return { version, notes, date: info.releaseDate ?? null };
  }
  async download(progress: (p: UpdateProgress) => void, signal: AbortSignal): Promise<void> {
    if (!this.result) throw updateFailure('UPDATE_ASSETS');
    signal.throwIfAborted(); const cancel = () => this.result?.cancellationToken?.cancel();
    const onProgress = (p: { transferred: number; total: number }) => progress({ transferred: p.transferred, total: p.total });
    signal.addEventListener('abort', cancel, { once: true }); this.updater.on('download-progress', onProgress);
    try {
      const files = await this.updater.downloadUpdate(this.result.cancellationToken); signal.throwIfAborted();
      this.file = files.find(f => f.toLowerCase().endsWith('.exe')) ?? null;
      await this.verify();
    } finally { signal.removeEventListener('abort', cancel); this.updater.removeListener('download-progress', onProgress); }
  }
  private async verify(): Promise<void> {
    if (!this.file || !this.result) throw updateFailure('UPDATE_ASSETS'); await plainPath(this.file, true);
    const asset = this.result.updateInfo.files.find(f => f.url.toLowerCase().endsWith('.exe'));
    if (!asset || await fileDigest(this.file, 'sha512', 'base64') !== asset.sha512) throw updateFailure('UPDATE_CHECKSUM');
  }
  async prepareInstall(): Promise<PreparedUpdate> {
    await this.verify();
    return { commit: async () => {
      let failure: Error | undefined;
      const onError = (error: Error) => { failure = error; };
      this.updater.on('error', onError);
      try { this.updater.quitAndInstall(true, true); if (failure) throw failure; }
      finally { this.updater.removeListener('error', onError); }
    }, cancel: async () => {} };
  }
}
