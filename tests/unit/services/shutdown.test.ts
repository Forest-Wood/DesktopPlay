import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DesktopService } from '../../../src/main/services/desktop-service';
import { CodexQuotaService } from '../../../src/main/services/codex-quota';
import { PetAssets } from '../../../src/main/pet-assets';

const directories: string[] = [];
const services: Array<{ dispose(): void }> = [];
const secrets = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() };
function reply(total: string): Response { return new Response(JSON.stringify({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: total, granted_balance: '0', topped_up_balance: total }] })); }
const quota = { rateLimits: { primary: { usedPercent: 25, windowDurationMins: 10080 } } };
async function directory(): Promise<string> { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'desktopplay-shutdown-test-')); directories.push(dir); return dir; }
async function desktop(fetchFn: typeof fetch): Promise<{ service: DesktopService; dataDir: string }> {
  const dataDir = await directory(), service = new DesktopService({ dataDir, secrets, fetchFn }); services.push(service); await service.init(); return { service, dataDir };
}
afterEach(async () => {
  services.splice(0).forEach(service => service.dispose()); vi.restoreAllMocks(); vi.useRealTimers();
  await Promise.all(directories.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe('shutdown write draining and refresh pause', () => {
  it('stops manual and scheduled balance refreshes and resumes the timer', async () => {
    vi.useFakeTimers(); const fetchFn = vi.fn(async () => reply('100'));
    const { service } = await desktop(fetchFn as typeof fetch); await service.setApiKey('test-key'); await service.refresh();
    const before = fetchFn.mock.calls.length; service.pause();
    await service.refresh(); await vi.advanceTimersByTimeAsync(120_000); expect(fetchFn).toHaveBeenCalledTimes(before);
    service.resume(); await vi.advanceTimersByTimeAsync(60_000); await service.drain(); expect(fetchFn).toHaveBeenCalledTimes(before + 1);
  });
  it('waits for an already started settings save before draining', async () => {
    const { service, dataDir } = await desktop(vi.fn(async () => reply('100')) as typeof fetch);
    const realOpen = fs.open.bind(fs); let release!: () => void;
    vi.spyOn(fs, 'open').mockImplementationOnce(async (...args: Parameters<typeof fs.open>) => {
      await new Promise<void>(resolve => { release = resolve; }); return realOpen(...args);
    });
    const save = service.updateSettings({ volume: 0.2 });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    service.pause(); let drained = false; const draining = service.drain().then(() => { drained = true; });
    await Promise.resolve(); await Promise.resolve(); expect(drained).toBe(false); expect(service.getState().settings.volume).not.toBe(0.2);
    release(); await save; await draining;
    expect(service.getState().settings.volume).toBe(0.2); expect(JSON.parse(await fs.readFile(path.join(dataDir, 'desktopplay.json'), 'utf8')).settings.volume).toBe(0.2);
  });
  it('ignores a late balance response during pause and restores refreshing after drain', async () => {
    let finish!: (response: Response) => void;
    const fetchFn = vi.fn().mockResolvedValueOnce(reply('100')).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; })).mockResolvedValueOnce(reply('98'));
    const { service, dataDir } = await desktop(fetchFn as typeof fetch); await service.setApiKey('test-key'); await service.refresh();
    const before = service.getState(), stored = await fs.readFile(path.join(dataDir, 'desktopplay.json'), 'utf8');
    const pending = service.refresh(); service.pause(); const draining = service.drain(); finish(reply('1')); await pending; await draining;
    expect(service.getState().balance).toEqual(before.balance); expect(service.getState().ledger).toEqual(before.ledger);
    expect(await fs.readFile(path.join(dataDir, 'desktopplay.json'), 'utf8')).toBe(stored);
    service.resume(); await service.refresh(); expect(service.getState().balance?.total).toBe('98.00000000'); expect(service.getState().ledger.today?.spent).toBe('2.00000000');
  });
  it('aborts pending quota reads, keeps prior quota and resumes successfully', async () => {
    let finish!: (value: unknown) => void; const signals: AbortSignal[] = [];
    const runner = vi.fn().mockResolvedValueOnce(quota).mockImplementationOnce((_exe, _cwd, signal: AbortSignal) => { signals.push(signal); return new Promise(resolve => { finish = resolve; }); }).mockResolvedValueOnce({ rateLimits: { primary: { usedPercent: 30, windowDurationMins: 10080 } } });
    const service = new CodexQuotaService({ cwd: '.', discoverExecutable: async () => 'codex.exe', requestRunner: runner }); services.push(service); await service.init();
    await service.refresh(); const before = service.getState(); const pending = service.refresh(); service.pause(); await service.drain(); await pending;
    expect(signals[0].aborted).toBe(true); finish({ rateLimits: { primary: { usedPercent: 99, windowDurationMins: 10080 } } }); await Promise.resolve();
    expect(service.getState().buckets).toEqual(before.buckets); const calls = runner.mock.calls.length; await service.refresh(); expect(runner).toHaveBeenCalledTimes(calls);
    service.resume(); await service.refresh(); expect(service.getState().buckets[0].primary?.remainingPercent).toBe(70);
  });
  it('waits for already queued pet-selection writes before drain resolves', async () => {
    const dataDir = await directory(), assets = new PetAssets(dataDir); await assets.init();
    const writes = [assets.select('gpt'), assets.selectGptAppearance('dragon')]; await assets.drain(); await Promise.all(writes);
    const restarted = new PetAssets(dataDir); await restarted.init(); expect(restarted.getSelected()).toBe('gpt'); expect(restarted.getGptAppearance()).toBe('dragon');
  });
});
