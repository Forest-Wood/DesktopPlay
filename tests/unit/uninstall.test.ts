import { describe, expect, it, vi } from 'vitest';
import { UninstallManager, uninstallPaths } from '../../src/main/uninstall';
import type { UninstallOptions } from '../../src/main/uninstall';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, spawn: vi.fn(original.spawn) };
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventuallyRead(filename: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try { return await readFile(filename, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await delay(50);
  }
  throw new Error('Fixture helper did not acknowledge the marker.');
}

const options: UninstallOptions = {
  isPackaged: true,
  exePath: 'C:\\Apps\\DesktopPet\\DesktopPet.exe',
  dataDir: 'C:\\Users\\Test\\AppData\\Roaming\\DesktopPlay',
  appDataDir: 'C:\\Users\\Test\\AppData\\Roaming',
  tempDir: 'C:\\Users\\Test\\AppData\\Local\\Temp',
  helperPath: 'C:\\Apps\\DesktopPet\\dist-electron\\uninstall-helper.ps1',
};

describe('uninstall target planning without deleting files', () => {
  it('derives a sibling NSIS uninstaller and the fixed shared data folder', () => {
    expect(uninstallPaths(options)).toEqual({
      programPath: options.exePath,
      dataPath: options.dataDir,
      uninstallerPath: 'C:\\Apps\\DesktopPet\\Uninstall DesktopPet.exe',
    });
  });

  it('limits portable removal to the launcher, even when it has been renamed', () => {
    const portable = { ...options, exePath: 'C:\\Temp\\unpacked\\DesktopPet.exe', portablePath: 'D:\\Downloads\\我的桌宠.exe' };
    expect(uninstallPaths(portable).programPath).toBe(portable.portablePath);
    expect(uninstallPaths(portable).dataPath).toBe(options.dataDir);
  });

  it('accepts case and separators but never an adjacent data folder', () => {
    expect(uninstallPaths({ ...options, dataDir: 'c:/users/test/AppData/Roaming/DESKTOPPLAY/' }).dataPath).toBe(options.dataDir);
    for (const dataDir of ['C:\\Users\\Test\\AppData\\Roaming\\DesktopPlay-old', 'C:\\Users\\Test\\AppData\\Roaming', 'C:\\Users\\Test\\AppData\\Roaming\\DesktopPlay\\..\\Other']) {
      expect(() => uninstallPaths({ ...options, dataDir })).toThrow('清理目录');
    }
  });

  it('rejects roots, directories, relative paths, UNC paths and control characters', () => {
    for (const portablePath of ['D:\\DesktopPet.exe', 'D:\\Downloads', '.\\DesktopPet.exe', '\\\\server\\share\\DesktopPet.exe', 'D:\\Downloads\\evil\n.exe']) {
      expect(() => uninstallPaths({ ...options, portablePath })).toThrow();
    }
    expect(() => uninstallPaths({ ...options, tempDir: '..\\Temp' })).toThrow();
    expect(() => uninstallPaths({ ...options, helperPath: '\\\\server\\helper.ps1' })).toThrow();
  });

  it('permits spaces and shell metacharacters as path data', () => {
    const portablePath = "D:\\Apps & notes\\桌宠 '$name;[1].exe";
    expect(uninstallPaths({ ...options, portablePath }).programPath).toBe(portablePath);
  });

  it('disables developer builds and rejects invalid cleanup choices without starting helpers', async () => {
    const manager = new UninstallManager({ ...options, isPackaged: false });
    await expect(manager.getInfo()).resolves.toMatchObject({ kind: 'unsupported', available: false, programPath: null });
    await expect(manager.prepare(true)).rejects.toThrow('开发版');
    await expect(manager.prepare('true' as unknown as boolean)).rejects.toThrow('选项');
  });
});

describe('two-phase helper handshake in disposable fixtures', () => {
  it('starts prepared, creates no commit until called, and supports cancellation', async () => {
    // Windows CI may expose TEMP through RUNNER~1. Production requires resolved
    // paths, so normalize this freshly created fixture rather than relax checks.
    const fixture = await realpath(await mkdtemp(path.join(os.tmpdir(), 'desktoppet-handshake-')));
    try {
      const helper = path.join(fixture, 'fixture-helper.ps1');
      await writeFile(helper, '# Non-executable fixture. Tests simulate the helper protocol.', 'utf8');
      const simulateHelper = (_command: string, args: readonly string[] = []) => {
        const child = Object.assign(new EventEmitter(), { unref: () => child });
        const manifestPath = args[args.indexOf('-ManifestPath') + 1];
        void (async () => {
          const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
          const directory = path.dirname(manifestPath);
          await writeFile(path.join(directory, 'ready.json'), JSON.stringify({ ok: true, token: manifest.token }));
          for (let i = 0; i < 100; i++) {
            const files = await readdir(directory);
            const marker = files.includes('cancel') ? 'cancelled' : files.includes('commit') ? 'committed' : null;
            if (marker) { await writeFile(path.join(directory, 'ack'), marker); child.emit('exit', 0); return; }
            await delay(25);
          }
          child.emit('exit', 1);
        })().catch(error => child.emit('error', error));
        return child as unknown as ReturnType<typeof spawn>;
      };
      vi.mocked(spawn).mockImplementationOnce(simulateHelper as typeof spawn).mockImplementationOnce(simulateHelper as typeof spawn);
      const manager = new UninstallManager({ ...options, tempDir: fixture, helperPath: helper });
      Object.defineProperty(manager, 'inspect', { value: async () => ({ kind: 'portable', programPath: path.join(fixture, 'fixture.exe'), dataPath: path.join(fixture, 'DesktopPlay') }) });
      const prepared = await manager.prepare(false);
      const plan = path.join(fixture, (await readdir(fixture)).find(name => name.startsWith('DesktopPet-uninstall-'))!);
      expect(await readdir(plan)).not.toContain('commit');
      await prepared.cancel();
      expect((await eventuallyRead(path.join(plan, 'ack'))).trim()).toBe('cancelled');
      await expect(prepared.commit()).rejects.toThrow('取消');

      const next = await manager.prepare(true);
      const nextPlan = path.join(fixture, (await readdir(fixture)).find(name => name.startsWith('DesktopPet-uninstall-') && path.join(fixture, name) !== plan)!);
      await next.commit();
      expect((await eventuallyRead(path.join(nextPlan, 'ack'))).trim()).toBe('committed');
      await expect(next.cancel()).rejects.toThrow('提交');
    } finally { await rm(fixture, { recursive: true, force: true }); }
  }, 15000);
});
