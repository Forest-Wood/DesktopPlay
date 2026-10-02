import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DesktopService } from '../../../src/main/services/desktop-service';

const secrets = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(`encrypted:${s}`), decryptString: (b: Buffer) => { const s = b.toString(); if (!s.startsWith('encrypted:')) throw new Error(); return s.slice(10); } };
function reply(total: string, currency = 'CNY') { return new Response(JSON.stringify({ is_available: true, balance_infos: [{ currency, total_balance: total, granted_balance: '0', topped_up_balance: total }] }), { status: 200 }); }
const services: DesktopService[] = [];
const directories: string[] = [];
afterEach(async () => { services.forEach(s => s.dispose()); services.length = 0; vi.restoreAllMocks(); vi.useRealTimers(); await Promise.all(directories.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });
async function fixture(responses: string[] = ['100'], options: { dataDir?: string; clock?: () => Date; adapter?: typeof secrets; fetchFn?: typeof fetch } = {}) {
  const dataDir = options.dataDir ?? await fs.mkdtemp(path.join(os.tmpdir(), 'desktopplay-service-')); if (!options.dataDir) directories.push(dataDir);
  const fetchFn = options.fetchFn ?? vi.fn(async () => reply(responses.shift() ?? '100')) as unknown as typeof fetch;
  const service = new DesktopService({ dataDir, secrets: options.adapter ?? secrets, fetchFn, now: options.clock ?? (() => new Date('2026-10-02T12:00:00Z')) });
  services.push(service); await service.init(); return { service, dataDir, fetchFn };
}
async function configured(values: string[], options: Parameters<typeof fixture>[1] = {}) { const result = await fixture(values, options); await result.service.setApiKey('test-key'); await result.service.refresh(); return result; }

describe('DesktopService ledger', () => {
  it('counts decreases and increases independently with eight decimal places', async () => {
    const { service } = await configured(['100', '99', '101', '100', '100']);
    for (let i = 0; i < 4; i++) await service.refresh();
    expect(service.getState().ledger.today).toMatchObject({ spent: '2.00000000', increased: '2.00000000' });
  });
  it('retains sub-cent precision without floating point drift', async () => {
    const { service } = await configured(['1.00000003', '1.00000001', '1.00000000']); await service.refresh(); await service.refresh();
    expect(service.getState().ledger.today?.spent).toBe('0.00000003');
  });
  it('does not show yesterday on a failed new day and starts a fresh baseline', async () => {
    let now = new Date('2026-10-02T12:00:00Z');
    const fetchFn = vi.fn().mockResolvedValueOnce(reply('100')).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(reply('90')).mockResolvedValueOnce(reply('89')) as unknown as typeof fetch;
    const { service } = await configured([], { clock: () => now, fetchFn }); now = new Date('2026-10-03T12:00:00Z');
    await service.refresh(); expect(service.getState().ledger.today).toBeNull();
    await service.refresh(); expect(service.getState().ledger.today?.spent).toBe('0.00000000');
    await service.refresh(); expect(service.getState().ledger.today?.spent).toBe('1.00000000');
  });
  it('uses Beijing midnight at 16:00 UTC independently of the host timezone', async () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      let now = new Date('2026-10-02T15:59:00Z');
      const { service } = await configured(['100', '99', '90', '89'], { clock: () => now });
      await service.refresh(); expect(service.getState().ledger.today).toMatchObject({ date: '2026-10-02', spent: '1.00000000' });
      now = new Date('2026-10-02T16:00:00Z');
      expect(service.getState().ledger.today).toBeNull();
      await service.refresh(); expect(service.getState().ledger.today).toMatchObject({ date: '2026-10-03', spent: '0.00000000' });
      now = new Date('2026-10-02T16:01:00Z');
      await service.refresh(); expect(service.getState().ledger.today).toMatchObject({ date: '2026-10-03', spent: '1.00000000' });
      expect(service.getState().ledger.history.map(summary => summary.date)).toEqual(['2026-10-02', '2026-10-03']);
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ; else process.env.TZ = previousTimezone;
    }
  });
  it('rejects backward observations without changing balance, totals or reminders', async () => {
    let now = new Date('2026-10-03T00:00:00Z');
    const { service } = await configured(['100', '99', '1', '98', '98'], { clock: () => now });
    await service.updateSettings({ lowBalanceThreshold: '50', dailyBudget: '2' });
    now = new Date('2026-10-03T00:01:00Z'); await service.refresh();
    const before = service.getState();
    now = new Date('2026-10-02T15:59:00Z'); await service.refresh();
    const rejected = service.getState();
    expect(rejected.status).toBe('error'); expect(rejected.error).toContain('校准时间');
    expect(rejected.balance).toEqual(before.balance); expect(rejected.ledger.history).toEqual(before.ledger.history); expect(rejected.alert).toEqual(before.alert);
    now = new Date('2026-10-03T00:02:00Z'); await service.refresh();
    expect(service.getState().ledger.today?.spent).toBe('2.00000000');
    const alert = service.getState().alert;
    // Equal timestamps remain valid; an identical repeated snapshot adds nothing.
    await service.refresh(); expect(service.getState().ledger.today?.spent).toBe('2.00000000'); expect(service.getState().alert).toEqual(alert);
  });
  it('continues the saved baseline after restart', async () => {
    const { service, dataDir } = await configured(['100', '99']); await service.refresh(); service.dispose();
    const restarted = await fixture(['98'], { dataDir }); await restarted.service.refresh();
    expect(restarted.service.getState().ledger.today?.spent).toBe('2.00000000');
  });
  it('isolates accounts and ignores a superseded in-flight request', async () => {
    let finish!: (response: Response) => void;
    const fetchFn = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; })).mockResolvedValueOnce(reply('20')) as unknown as typeof fetch;
    const { service } = await fixture([], { fetchFn }); await service.setApiKey('old-key'); const old = service.refresh();
    await service.setApiKey('new-key'); await service.refresh(); finish(reply('1')); await old;
    expect(service.getState().balance?.total).toBe('20.00000000'); expect(service.getState().ledger.today?.spent).toBe('0.00000000');
  });
  it('coalesces concurrent refresh requests', async () => {
    let finish!: (response: Response) => void; const fetchFn = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })) as unknown as typeof fetch;
    const { service } = await fixture([], { fetchFn }); await service.setApiKey('test-key'); const first = service.refresh(); const second = service.refresh();
    expect(first).toBe(second); expect(fetchFn).toHaveBeenCalledTimes(1); finish(reply('100')); await first;
  });
  it('clears the visible account and restores its own ledger on returning to the same key', async () => {
    const { service } = await configured(['100', '99', '20', '98']); await service.refresh();
    await service.clearApiKey(); expect(service.getState()).toMatchObject({ status: 'unconfigured', hasApiKey: false, balance: null });
    await service.setApiKey('second-key'); await service.refresh(); expect(service.getState().ledger.today?.spent).toBe('0.00000000');
    await service.setApiKey('test-key'); await service.refresh(); expect(service.getState().ledger.today?.spent).toBe('2.00000000');
  });
});

describe('DesktopService validation and recovery', () => {
  it.each([401, 429, 500])('sanitizes HTTP %i errors and leaves ledger unchanged', async status => {
    const fetchFn = vi.fn().mockResolvedValueOnce(reply('100')).mockResolvedValueOnce(new Response('test-key SECRET SERVER BODY', { status })) as unknown as typeof fetch;
    const { service } = await configured([], { fetchFn }); await service.refresh();
    expect(service.getState().status).toBe('error'); expect(service.getState().error).not.toMatch(/SECRET|test-key|SERVER/); expect(service.getState().balance?.total).toBe('100.00000000');
  });
  it('rejects malformed and negative balances without moving the baseline', async () => {
    const { service } = await configured(['100', '-1', '99']); await service.refresh(); expect(service.getState().status).toBe('error'); await service.refresh(); expect(service.getState().ledger.today?.spent).toBe('1.00000000');
  });
  it('times out even if the fetch adapter ignores abort', async () => {
    vi.useFakeTimers(); const { service } = await fixture([], { fetchFn: (() => new Promise(() => {})) as typeof fetch });
    await service.setApiKey('test-key'); const pending = service.refresh(); await vi.advanceTimersByTimeAsync(10001); await pending;
    expect(service.getState().error).toBe('请求超时，请稍后重试。');
  });
  it('allows settings without a key and rejects dangerous or invalid patches', async () => {
    const { service } = await fixture(); await service.updateSettings({ scale: 2, dailyBudget: '0.00000001' }); expect(service.getState().hasApiKey).toBe(false);
    for (const patch of [{ scale: NaN }, { phrases: [] }, { dailyBudget: '1e3' }, { volume: 2 }, JSON.parse('{"__proto__":{}}')]) await expect(service.updateSettings(patch)).rejects.toThrow();
    await expect(service.updateSettings({ get scale(): number { throw new Error('must not execute'); } })).rejects.toThrow('危险');
    await expect(service.updateSettings({ [Symbol('hidden')]: true })).rejects.toThrow('未知');
  });
  it('refuses plaintext fallback when encryption is unavailable', async () => {
    const { service, dataDir } = await fixture([], { adapter: { ...secrets, isEncryptionAvailable: () => false } });
    await expect(service.setApiKey('test-key')).rejects.toThrow('安全存储'); expect(service.getState().hasApiKey).toBe(false); expect(await fs.readdir(dataDir)).toEqual([]);
  });
  it('recovers a backup and preserves corrupt originals', async () => {
    const { service, dataDir } = await configured(['100', '99']); await service.refresh(); service.dispose(); await fs.writeFile(path.join(dataDir, 'desktopplay.json'), '{broken');
    const restored = await fixture(['98'], { dataDir }); await restored.service.refresh();
    expect(restored.service.getState().warning).toContain('备份'); expect((await fs.readdir(dataDir)).some(name => name.includes('.corrupt-'))).toBe(true);
    expect(restored.service.getState().balance?.total).toBe('98.00000000');
  });
  it('prefers CNY and validates every currency entry', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: '5', granted_balance: '0', topped_up_balance: '5' }, { currency: 'CNY', total_balance: '30', granted_balance: '0', topped_up_balance: '30' }] }))) as unknown as typeof fetch;
    const { service } = await configured([], { fetchFn }); expect(service.getState().balance?.currency).toBe('CNY');
  });
});

describe('DesktopService alerts', () => {
  it('re-arms low balance after recovery and deduplicates daily budget across restart', async () => {
    const { service, dataDir } = await configured(['100', '99', '101', '99']); await service.updateSettings({ lowBalanceThreshold: '100', dailyBudget: '1' });
    await service.refresh(); const first = service.getState().alert; expect(first?.kind).toBe('daily-budget');
    await service.refresh(); await service.refresh(); const next = service.getState().alert; expect(next?.kind).toBe('low-balance'); expect(next?.id).not.toBe(first?.id);
    service.dispose(); const restored = await fixture(['98'], { dataDir }); await restored.service.refresh(); expect(restored.service.getState().alert).toBeNull();
  });
  it('re-evaluates changed settings immediately', async () => {
    const { service } = await configured(['10']); await service.updateSettings({ lowBalanceThreshold: '11' }); const first = service.getState().alert?.id;
    await service.updateSettings({ volume: 0.1 }); expect(service.getState().alert?.id).toBe(first);
    await service.updateSettings({ lowBalanceThreshold: null }); await service.updateSettings({ lowBalanceThreshold: '11' }); expect(service.getState().alert?.id).not.toBe(first);
  });
});

describe('DesktopService persistence transactions', () => {
  it.each(['settings', 'set-key', 'clear-key'] as const)('keeps committed memory and disk when %s saving fails', async operation => {
    const { service, dataDir } = await configured(['100']);
    const before = service.getState(); const file = path.join(dataDir, 'desktopplay.json'); const stored = await fs.readFile(file, 'utf8');
    const failure = vi.spyOn(fs, 'open').mockRejectedValueOnce(new Error('storage unavailable'));
    const pending = operation === 'settings' ? service.updateSettings({ scale: 2 }) : operation === 'set-key' ? service.setApiKey('failed-new-key') : service.clearApiKey();
    await expect(pending).rejects.toThrow('storage unavailable');
    expect(service.getState()).toEqual(before); expect(await fs.readFile(file, 'utf8')).toBe(stored); failure.mockRestore();
    // A later valid mutation cannot accidentally persist a failed candidate.
    await service.updateSettings({ volume: 0.2 }); await service.refresh();
    const after = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(after.settings.scale).toBe(before.settings.scale); expect(after.key).toBe(JSON.parse(stored).key); expect(Object.keys(after.accounts)).toEqual(Object.keys(JSON.parse(stored).accounts));
    expect(service.getState().hasApiKey).toBe(true); expect(service.getState().balance?.total).toBe('100.00000000');
  });
  it('exposes only committed settings while saving and serializes concurrent mutations after failure', async () => {
    const { service, dataDir } = await configured(['100']); const before = service.getState();
    let reject!: (reason: Error) => void;
    const failure = vi.spyOn(fs, 'open').mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const first = service.updateSettings({ scale: 2 }); const rejected = expect(first).rejects.toThrow('storage unavailable');
    const second = service.updateSettings({ volume: 0.2 });
    await vi.waitFor(() => expect(reject).toBeTypeOf('function'));
    expect(service.getState()).toEqual(before);
    reject(new Error('storage unavailable')); await rejected; await second; failure.mockRestore();
    expect(service.getState().settings).toMatchObject({ scale: before.settings.scale, volume: 0.2 });
    expect(JSON.parse(await fs.readFile(path.join(dataDir, 'desktopplay.json'), 'utf8')).settings).toMatchObject({ scale: before.settings.scale, volume: 0.2 });
  });
  it('does not advance balance, consumption or alert deduplication when ledger persistence fails', async () => {
    const { service, dataDir } = await configured(['100', '99', '98']); await service.updateSettings({ dailyBudget: '1' });
    const before = service.getState(); const file = path.join(dataDir, 'desktopplay.json'); const stored = await fs.readFile(file, 'utf8');
    const failure = vi.spyOn(fs, 'open').mockRejectedValueOnce(new Error('storage unavailable'));
    await service.refresh(); expect(service.getState().status).toBe('error'); expect(service.getState().balance).toEqual(before.balance); expect(service.getState().ledger).toEqual(before.ledger); expect(service.getState().alert).toBeNull();
    expect(await fs.readFile(file, 'utf8')).toBe(stored); failure.mockRestore();
    await service.refresh(); expect(service.getState().ledger.today?.spent).toBe('2.00000000'); expect(service.getState().alert?.kind).toBe('daily-budget');
  });
});
