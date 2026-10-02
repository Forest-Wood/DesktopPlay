import { spawn, execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, open, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { UninstallInfo } from '../shared/types';

export interface UninstallOptions {
  isPackaged: boolean;
  exePath: string;
  portablePath?: string;
  dataDir: string;
  appDataDir: string;
  tempDir: string;
  helperPath: string;
  pid?: number;
}
type ProcessIdentity = { pid: number; created: string; executable: string };
const execFileAsync = promisify(execFile);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const canonical = (value: string) => path.win32.normalize(value).replace(/\\+$/, '').toLowerCase();

/** Pure validation: no renderer-supplied path ever reaches the helper. */
export function uninstallPaths(options: UninstallOptions) {
  for (const value of [options.exePath, options.dataDir, options.appDataDir, options.tempDir, options.helperPath, ...(options.portablePath ? [options.portablePath] : [])]) {
    if (!path.win32.isAbsolute(value) || /[\x00-\x1f]/.test(value) || value.startsWith('\\\\')) throw new Error('卸载路径无效。');
  }
  const dataPath = path.win32.join(options.appDataDir, 'DesktopPlay');
  if (canonical(options.dataDir) !== canonical(dataPath)) throw new Error('用户数据目录与固定清理目录不一致。');
  const programPath = options.portablePath || options.exePath;
  if (path.win32.extname(programPath).toLowerCase() !== '.exe' || canonical(path.win32.dirname(programPath)) === canonical(path.win32.parse(programPath).root)) throw new Error('软件路径无效。');
  return { programPath, dataPath, uninstallerPath: path.win32.join(path.win32.dirname(options.exePath), 'Uninstall DesktopPet.exe') };
}

async function assertPlainPath(filename: string, requiredFile = false): Promise<void> {
  const absolute = path.resolve(filename);
  let current = absolute;
  while (true) {
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error('卸载不支持包含目录链接的路径。');
      if (current === absolute && requiredFile && !stat.isFile()) throw new Error('卸载目标不是普通文件。');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || requiredFile && current === absolute) throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (requiredFile && canonical(await realpath(filename)) !== canonical(absolute)) throw new Error('卸载目标路径不一致。');
}

async function sha256(filename: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

function powershellPath(): string {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  return path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

async function processChain(pid: number): Promise<ProcessIdentity[]> {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('无法识别应用进程。');
  // Only a validated integer is inserted; filenames never become PowerShell code.
  const script = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false); $result=@(); $next=${pid}; $childCreated=[DateTime]::MaxValue; for($i=0;$i -lt 16 -and $next -gt 0;$i++){ $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$next); if(!$p -or !$p.ExecutablePath -or $p.CreationDate -gt $childCreated){break}; $result+=@{pid=[int]$p.ProcessId; created=$p.CreationDate.ToUniversalTime().ToString('o'); executable=[string]$p.ExecutablePath}; $childCreated=$p.CreationDate; $next=[int]$p.ParentProcessId }; ConvertTo-Json -InputObject @($result) -Compress`;
  const result = await execFileAsync(powershellPath(), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 10000, maxBuffer: 64 * 1024 });
  const chain: unknown = JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim());
  if (!Array.isArray(chain) || !chain.length || chain.some(p => !p || !Number.isSafeInteger(p.pid) || p.pid < 1 || typeof p.created !== 'string' || !Number.isFinite(Date.parse(p.created)) || typeof p.executable !== 'string' || !path.win32.isAbsolute(p.executable))) throw new Error('无法验证软件进程身份。');
  return chain as ProcessIdentity[];
}

export class UninstallManager {
  private preparing = false;
  constructor(private options: UninstallOptions) {}

  private async inspect() {
    if (!this.options.isPackaged || process.platform !== 'win32') throw new Error('开发版或解包版不支持应用内卸载。');
    const targets = uninstallPaths(this.options);
    await Promise.all([assertPlainPath(targets.programPath, true), assertPlainPath(targets.dataPath), assertPlainPath(this.options.tempDir)]);
    const chain = await processChain(this.options.pid ?? process.pid);
    const parent = chain[0];
    if (canonical(parent.executable) !== canonical(this.options.exePath)) throw new Error('当前应用进程路径不一致。');
    if (this.options.portablePath) {
      const launcher = chain.slice(1).find(p => canonical(p.executable) === canonical(targets.programPath));
      if (!launcher) throw new Error('无法验证便携版启动器，请退出后手动删除该 EXE。');
      return { ...targets, kind: 'portable' as const, parent, launcher, programHash: await sha256(targets.programPath), uninstallerHash: null };
    }
    if (path.win32.basename(this.options.exePath).toLowerCase() !== 'desktoppet.exe') throw new Error('当前软件不是受支持的安装版。');
    await assertPlainPath(targets.uninstallerPath, true);
    return { ...targets, kind: 'installed' as const, parent, launcher: null, programHash: await sha256(targets.programPath), uninstallerHash: await sha256(targets.uninstallerPath) };
  }

  async getInfo(): Promise<UninstallInfo> {
    try {
      const target = await this.inspect();
      return { kind: target.kind, programPath: target.programPath, dataPath: target.dataPath, available: true, reason: null };
    } catch (error) {
      return { kind: 'unsupported', programPath: this.options.isPackaged ? this.options.portablePath || this.options.exePath : null, dataPath: this.options.dataDir, available: false, reason: error instanceof Error ? error.message : '无法安全卸载当前软件。' };
    }
  }

  async prepare(removeData: boolean): Promise<{ commit(): Promise<void>; cancel(): Promise<void> }> {
    if (typeof removeData !== 'boolean') throw new Error('清理数据选项无效。');
    if (this.preparing) throw new Error('卸载已经在准备中。');
    this.preparing = true;
    let directory: string | undefined;
    try {
      const target = await this.inspect();
      await assertPlainPath(this.options.helperPath, true);
      const token = randomUUID();
      directory = path.join(this.options.tempDir, `DesktopPet-uninstall-${token}`);
      await mkdir(directory, { recursive: false, mode: 0o700 });
      await assertPlainPath(directory);
      const manifestPath = path.join(directory, 'manifest.json');
      await writeFile(manifestPath, JSON.stringify({ version: 1, token, ...target, removeData, appDataDir: this.options.appDataDir, tempDir: this.options.tempDir }), { flag: 'wx', mode: 0o600 });
      const helperCopy = path.join(directory, 'helper.ps1');
      await copyFile(this.options.helperPath, helperCopy);
      const output = await open(path.join(directory, 'launch.log'), 'wx', 0o600);
      let child: ReturnType<typeof spawn>;
      let launchError: Error | undefined;
      try {
        // Windows PowerShell exits before running -File under DETACHED_PROCESS.
        // A hidden bootstrap uses Start-Process to create an independent helper.
        child = spawn(powershellPath(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperCopy, '-ManifestPath', manifestPath, '-Bootstrap'], { windowsHide: true, stdio: ['ignore', output.fd, output.fd] });
        child.once('error', error => { launchError = error; });
        child.once('exit', code => { if (code !== 0) launchError = new Error('卸载助手启动失败。'); });
      } finally { await output.close(); }
      child.unref();
      const deadline = Date.now() + 10000;
      while (true) {
        if (launchError) throw new Error('无法启动卸载助手。');
        try {
          const ready = JSON.parse((await readFile(path.join(directory, 'ready.json'), 'utf8')).replace(/^\uFEFF/, ''));
          if (ready.token !== token || ready.ok !== true) throw new Error(typeof ready.reason === 'string' ? ready.reason : '卸载助手校验失败。');
          break;
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (Date.now() >= deadline) throw new Error(`卸载助手未准备完成，应用已保留。日志：${path.join(directory, 'launch.log')}`);
        await pause(100);
      }
      const planDirectory = directory;
      let state: 'prepared' | 'committed' | 'cancelled' = 'prepared';
      return {
        commit: async () => {
          if (state === 'cancelled') throw new Error('卸载已取消。');
          if (state === 'committed') return;
          await writeFile(path.join(planDirectory, 'commit.tmp'), token, { flag: 'wx', mode: 0o600 });
          await rename(path.join(planDirectory, 'commit.tmp'), path.join(planDirectory, 'commit'));
          state = 'committed';
        },
        cancel: async () => {
          if (state === 'committed') throw new Error('卸载已经提交。');
          if (state === 'cancelled') return;
          await writeFile(path.join(planDirectory, 'cancel'), token, { flag: 'wx', mode: 0o600 });
          state = 'cancelled'; this.preparing = false;
        },
      };
    } catch (error) {
      if (directory) await writeFile(path.join(directory, 'cancel'), 'cancelled', { flag: 'wx', mode: 0o600 }).catch(() => {});
      this.preparing = false;
      throw error;
    }
  }
}
