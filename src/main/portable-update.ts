import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { processChain } from './uninstall';
import { fileDigest, plainPath, samePath, updateFailure } from './services/update-files';
import type { PreparedUpdate } from './services/app-update';

interface Options { programPath: string; exePath: string; dataDir: string; helperPath: string; pid?: number }
interface Pending { token: string; version: string; programPath: string; attempt: string; oldHash: string; newHash: string }
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** The only executable target is the verified portable launcher of this exact process. */
export class PortableUpdateManager {
  constructor(private readonly options: Options) {}
  private get root(): string { return path.join(this.options.dataDir, 'updates'); }
  private get pendingFile(): string { return path.join(this.root, 'pending.json'); }
  async prepare(filename: string, hash: string, version: string): Promise<PreparedUpdate> {
    const o = this.options;
    await Promise.all([plainPath(o.programPath, true), plainPath(o.helperPath, true), plainPath(filename, true), plainPath(this.root)]);
    if (path.extname(o.programPath).toLowerCase() !== '.exe' || !/^[a-f0-9]{64}$/.test(hash) || await fileDigest(filename) !== hash) throw updateFailure('UPDATE_CHECKSUM');
    const chain = await processChain(o.pid ?? process.pid), parent = chain[0];
    const launcher = chain.slice(1).find(p => samePath(p.executable, o.programPath));
    if (!parent || !samePath(parent.executable, o.exePath) || !launcher) throw updateFailure('UPDATE_HELPER');
    const token = randomUUID(), attempt = path.join(this.root, `attempt-${token}`);
    await mkdir(attempt, { recursive: true, mode: 0o700 }); await plainPath(attempt);
    const staged = `${o.programPath}.update-${token}.new`, backup = `${o.programPath}.update-${token}.old`;
    await Promise.all([plainPath(staged), plainPath(backup)]);
    const oldHash = await fileDigest(o.programPath);
    let copied = false;
    try { await copyFile(filename, staged, 1); copied = true; if (await fileDigest(staged) !== hash) throw updateFailure('UPDATE_CHECKSUM'); }
    catch (error) { if (copied) await unlink(staged).catch(() => {}); if ((error as { code?: string }).code === 'UPDATE_CHECKSUM') throw error; throw updateFailure('UPDATE_PERMISSION'); }
    const manifest = { token, version, programPath: o.programPath, attempt, oldHash, newHash: hash, staged, backup, processes: [parent, launcher] };
    const manifestPath = path.join(attempt, 'manifest.json'), helper = path.join(attempt, 'helper.ps1');
    let committed = false;
    const cancel = async () => {
      if (committed) return;
      await writeFile(path.join(attempt, 'cancel'), token, { mode: 0o600 });
      // Only our staged file can be removed; never delete the current program or backup.
      try { if (await fileDigest(staged) === hash) await unlink(staged); } catch { /* Leave recoverable staging on access errors. */ }
    };
    try {
      await writeFile(manifestPath, JSON.stringify(manifest), { flag: 'wx', mode: 0o600 }); await copyFile(o.helperPath, helper);
      const output = await open(path.join(attempt, 'launch.log'), 'wx', 0o600);
      const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      let launchError = false;
      try {
        const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-ManifestPath', manifestPath, '-Bootstrap'], { windowsHide: true, stdio: ['ignore', output.fd, output.fd] });
        child.on('error', () => { launchError = true; }); child.on('exit', code => { if (code !== 0) launchError = true; }); child.unref();
      } finally { await output.close(); }
      const deadline = Date.now() + 10000;
      while (true) {
        if (launchError || Date.now() > deadline) throw updateFailure('UPDATE_HELPER');
        try { if ((await readFile(path.join(attempt, 'ready'), 'utf8')).trim() === token) break; } catch { /* Bounded readiness handshake. */ }
        await pause(100);
      }
      const pending: Pending = { token, version, programPath: o.programPath, attempt, oldHash, newHash: hash };
      await plainPath(this.pendingFile); await this.marker(this.pendingFile, JSON.stringify(pending));
      return { cancel, commit: async () => { await this.marker(path.join(attempt, 'go'), token); committed = true; } };
    } catch (error) { await cancel(); throw error; }
  }
  private async marker(filename: string, value: string): Promise<void> {
    const temporary = `${filename}.${randomUUID()}.tmp`;
    await plainPath(filename); await plainPath(temporary);
    await writeFile(temporary, value, { flag: 'wx', mode: 0o600 });
    await rename(temporary, filename);
  }
  private async pending(): Promise<Pending | null> {
    try {
      await plainPath(this.pendingFile, true); const p = JSON.parse(await readFile(this.pendingFile, 'utf8')) as Pending;
      if (!/^[a-f0-9-]{36}$/.test(p.token) || !samePath(p.programPath, this.options.programPath) || !samePath(p.attempt, path.join(this.root, `attempt-${p.token}`)) || !/^[a-f0-9]{64}$/.test(p.newHash) || !/^[a-f0-9]{64}$/.test(p.oldHash)) return null;
      await plainPath(p.attempt); return p;
    } catch { return null; }
  }
  async acknowledge(version: string, token = process.env.DESKTOPPLAY_UPDATE_TOKEN): Promise<void> {
    if (!token) return;
    const p = await this.pending();
    if (!p || p.token !== token || p.version !== version) return;
    await plainPath(p.programPath, true);
    if (await fileDigest(p.programPath) !== p.newHash) return;
    await this.marker(path.join(p.attempt, 'healthy'), JSON.stringify({ token, version }));
  }
  async previousFailure(): Promise<boolean> {
    const p = await this.pending(); if (!p) return false;
    try { const result = JSON.parse((await readFile(path.join(p.attempt, 'result.json'), 'utf8')).replace(/^\uFEFF/, '')); return result.token === p.token && result.status !== 'success'; } catch { return false; }
  }
}
