// Trusted test executable only. Never imported by the production entry point.
import { app, BrowserWindow } from 'electron';
import { NsisUpdater } from 'electron-updater';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { AppUpdateService } from '../../src/main/services/app-update';
import { InstalledUpdateBackend } from '../../src/main/services/installed-update';
import { PortableUpdateBackend } from '../../src/main/services/portable-update';
import { GithubUpdateTransport } from '../../src/main/services/update-http';
import { PortableUpdateManager } from '../../src/main/portable-update';

declare const FIXTURE_ROOT: string;
const portable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE), kind = portable ? 'portable' : 'installed';
const profile = path.join(FIXTURE_ROOT, `${kind}-profile`), version = app.getVersion();
app.setPath('userData', profile); app.setAppUserModelId('io.github.forestwood.desktopplay.update-fixture');
if (!app.requestSingleInstanceLock()) app.exit(2);
let service: AppUpdateService;
app.on('before-quit', () => service?.dispose());
app.whenReady().then(async () => {
  await mkdir(profile, { recursive: true });
  if (portable && version === '0.0.2') {
    try { await unlink(path.join(FIXTURE_ROOT, 'fail-next-start')); app.exit(10); return; } catch { /* successful fixture */ }
  }
  for (const [file, value] of Object.entries({ 'settings.json': '{"position":{"x":123,"y":456},"theme":"white"}', 'fixture-key.enc': 'TEST-SECRET-NOT-A-REAL-KEY', 'ledger.json': '[{"spent":42}]', 'imported-asset.txt': 'fixture asset' })) {
    try { await writeFile(path.join(profile, file), value, { flag: 'wx' }); } catch { /* preserve existing */ }
  }
  const endpoint = JSON.parse(await readFile(path.join(FIXTURE_ROOT, 'server.json'), 'utf8')).url;
  const manager = portable ? new PortableUpdateManager({ programPath: process.env.PORTABLE_EXECUTABLE_FILE!, exePath: process.execPath, dataDir: profile, helperPath: path.join(__dirname, 'update-helper.ps1') }) : null;
  const transport = new GithubUpdateTransport((url, init) => {
    const original = new URL(String(url));
    return fetch(endpoint + (original.hostname === 'api.github.com' ? '/release.json' : '/' + original.pathname.split('/').at(-1)), init);
  });
  const backend = portable ? new PortableUpdateBackend({ cacheDir: path.join(profile, 'downloads'), transport, prepare: (file, hash, v) => manager!.prepare(file, hash, v) }) : new InstalledUpdateBackend(new NsisUpdater({ provider: 'generic', url: endpoint + '/' }));
  let writes = Promise.resolve();
  const publish = () => { const data = JSON.stringify({ version, pid: process.pid, executable: process.execPath, portablePath: process.env.PORTABLE_EXECUTABLE_FILE, state: service.getState(), startup: app.getLoginItemSettings({ path: portable ? process.env.PORTABLE_EXECUTABLE_FILE : process.execPath, args: [] }).openAtLogin }); writes = writes.catch(() => {}).then(() => writeFile(path.join(profile, 'status.json'), data)); };
  service = new AppUpdateService({ version, kind, dataDir: profile, backend, onState: publish }); await service.init();
  const window = new BrowserWindow({ width: 320, height: 150, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await window.loadURL('data:text/html,Isolated updater fixture');
  await manager?.acknowledge(version); publish();
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    let command: string; try { command = await readFile(path.join(profile, 'command'), 'utf8'); await unlink(path.join(profile, 'command')); } catch { return; }
    busy = true;
    try {
      if (command === 'check') await service.check();
      if (command === 'download') await service.download();
      if (command === 'cancel') await service.cancelDownload();
      if (command === 'startup' || command === 'cleanup') app.setLoginItemSettings({ openAtLogin: command === 'startup', path: portable ? process.env.PORTABLE_EXECUTABLE_FILE : process.execPath, args: [], name: `DesktopPet-T008-${kind}` });
      if (command === 'install') { const transaction = await service.prepareInstall(); await writes; await transaction.commit(); if (portable) app.quit(); }
      if (command === 'quit' || command === 'cleanup') { await writes; app.quit(); }
      publish();
    } catch (error) { await writeFile(path.join(profile, 'failure.txt'), String(error)); }
    finally { busy = false; }
  }, 150);
}).catch(async error => { await writeFile(path.join(FIXTURE_ROOT, `${kind}-fatal.txt`), String(error)); app.exit(1); });
