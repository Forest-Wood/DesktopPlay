import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
vi.mock('electron-updater', () => ({ NsisUpdater: class {} }));
import { InstalledUpdateBackend } from '../../../src/main/services/installed-update';
import { portableRelease } from '../../../src/main/services/portable-update';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'desktoppet-nsis-')); dirs.push(dir); const file = path.join(dir, 'setup.exe'); await writeFile(file, 'fixture');
  const token = { cancel: vi.fn() }, updater = Object.assign(new EventEmitter(), { checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '0.5.4', releaseNotes: 'Notes', files: [{ url: 'setup.exe', sha512: createHash('sha512').update('fixture').digest('base64') }] }, cancellationToken: token })), downloadUpdate: vi.fn(async () => [file]), quitAndInstall: vi.fn() });
  const backend = new InstalledUpdateBackend(updater as any); return { backend, updater, file, token };
}
it('requires explicit download and installation, disables prerelease/downgrade/differential/exit installation', async () => {
  const f = await fixture(), signal = new AbortController().signal;
  expect(f.updater).toMatchObject({ autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false, allowDowngrade: false, disableDifferentialDownload: true });
  await f.backend.check(signal); expect(f.updater.downloadUpdate).not.toHaveBeenCalled(); await f.backend.download(() => {}, signal);
  const prepared = await f.backend.prepareInstall(); expect(f.updater.quitAndInstall).not.toHaveBeenCalled(); await prepared.commit(); expect(f.updater.quitAndInstall).toHaveBeenCalledWith(true, true);
});
it('rejects changed caches and propagates immediate installer failure', async () => {
  const f = await fixture(), signal = new AbortController().signal; await f.backend.check(signal); await f.backend.download(() => {}, signal);
  const prepared = await f.backend.prepareInstall(); f.updater.quitAndInstall.mockImplementation(() => { f.updater.emit('error', new Error('spawn failed')); }); await expect(prepared.commit()).rejects.toThrow('spawn failed');
  await writeFile(f.file, 'tampered'); await expect(f.backend.prepareInstall()).rejects.toThrow();
});
it('forwards cancellation without retaining progress listeners', async () => {
  const f = await fixture(), controller = new AbortController(); await f.backend.check(controller.signal);
  f.updater.downloadUpdate.mockImplementation(async () => { controller.abort(); return [f.file]; });
  await expect(f.backend.download(() => {}, controller.signal)).rejects.toThrow(); expect(f.token.cancel).toHaveBeenCalledOnce(); expect(f.updater.listenerCount('download-progress')).toBe(0);
});
it('returns the same authored announcement for NSIS metadata and a portable release body', async () => {
  const f = await fixture(), notes = '- 完善更新公告。\n- 修复已有功能。\n- 保留原有设置。';
  const result = await f.updater.checkForUpdates(); result.updateInfo.releaseNotes = notes;
  f.updater.checkForUpdates.mockResolvedValue(result);
  const installed = await f.backend.check(new AbortController().signal);
  const portable = portableRelease({ tag_name: 'v0.5.4', draft: false, prerelease: false, body: notes, assets: ['DesktopPet-0.5.4-Portable-x64.exe', 'SHA256SUMS.txt'].map(name => ({ name, state: 'uploaded', size: 10, browser_download_url: `https://github.com/Forest-Wood/DesktopPlay/releases/download/v0.5.4/${name}` })) });
  expect(installed?.notes).toBe(notes); expect(portable?.notes).toBe(installed?.notes);
});
