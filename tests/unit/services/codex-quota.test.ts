import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodexQuotaService, normalizeCodexQuota, requestCodexQuota } from '../../../src/main/services/codex-quota';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
const services: CodexQuotaService[] = [];
const directories: string[] = [];
afterEach(async () => { for (const service of services.splice(0)) service.dispose(); vi.clearAllMocks(); vi.useRealTimers(); await Promise.all(directories.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });
const response = { rateLimits: { limitId: 'codex', planType: 'plus', primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1_800_000_000 }, secondary: { usedPercent: 40, windowDurationMins: 10080 } } };
async function fixture(requestRunner: NonNullable<ConstructorParameters<typeof CodexQuotaService>[0]['requestRunner']>, timeoutMs?: number) {
  const service = new CodexQuotaService({ cwd: '.', discoverExecutable: async () => 'codex.exe', requestRunner, timeoutMs, now: () => new Date('2026-10-02T12:00:00Z') });
  services.push(service); await service.init(); return service;
}
function childFixture() {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  return child;
}
describe('Codex quota normalization', () => {
  it('reads named buckets and both actual windows, without inventing resets', () => {
    const buckets = normalizeCodexQuota({ rateLimitsByLimitId: { codex: response.rateLimits, review: { limitName: 'Code review', primary: { usedPercent: 105 } } } });
    expect(buckets[0]).toMatchObject({ id: 'codex', planType: 'plus', primary: { remainingPercent: 75, windowMinutes: 300, resetsAt: '2027-01-15T08:00:00.000Z' }, secondary: { remainingPercent: 60, windowMinutes: 10080, resetsAt: null } });
    expect(buckets[1]).toMatchObject({ name: 'Code review', primary: { usedPercent: 100, remainingPercent: 0, windowMinutes: null, resetsAt: null } });
  });
  it('keeps absent or malformed windows unknown instead of displaying 100% remaining', () => {
    expect(normalizeCodexQuota({ rateLimits: { primary: { usedPercent: -5 }, secondary: { usedPercent: '25' }, credits: { balance: '12.50', unlimited: false } } })[0]).toMatchObject({ primary: null, secondary: null, creditsRemaining: '12.50' });
    expect(() => normalizeCodexQuota({ rateLimits: { primary: {} } })).toThrow();
    expect(() => normalizeCodexQuota({ result: response })).toThrow();
    expect(() => normalizeCodexQuota(null)).toThrow();
  });
  it('rejects negative usage and meaningless credit-only responses', () => {
    expect(() => normalizeCodexQuota({ rateLimits: { primary: { usedPercent: -1 } } })).toThrow();
    for (const credits of [{}, { balance: '' }, { balance: '  ' }, { balance: 'unknown' }, { balance: '-1' }, { balance: -1 }, { balance: Number.NaN }, { unlimited: false }, { hasCredits: false }]) {
      expect(() => normalizeCodexQuota({ rateLimits: { credits } })).toThrow();
    }
    expect(normalizeCodexQuota({ rateLimits: { credits: { balance: 0 } } })[0]).toMatchObject({ primary: null, secondary: null, creditsRemaining: '0' });
    expect(normalizeCodexQuota({ rateLimits: { credits: { unlimited: true } } })[0]).toMatchObject({ primary: null, secondary: null, creditsRemaining: null, unlimitedCredits: true });
  });
  it('rejects invalid dates and unknown numeric window values', () => {
    expect(normalizeCodexQuota({ rateLimits: { primary: { usedPercent: 10, resetsAt: 1e99, windowDurationMins: '300' } } })[0].primary).toMatchObject({ resetsAt: null, windowMinutes: null });
  });
});
describe('Codex quota service', () => {
  it('discovers without executing, then coalesces concurrent refreshes', async () => {
    let resolve!: (value: unknown) => void;
    const runner = vi.fn(() => new Promise(resolvePromise => { resolve = resolvePromise; }));
    const service = await fixture(runner);
    expect(runner).not.toHaveBeenCalled(); expect(service.getState().status).toBe('idle');
    const first = service.refresh(), second = service.refresh();
    expect(first).toBe(second); expect(runner).toHaveBeenCalledTimes(1);
    resolve(response); await first;
    expect(service.getState()).toMatchObject({ status: 'ready', updatedAt: '2026-10-02T12:00:00.000Z' });
    const snapshot = service.getState(); snapshot.buckets[0].name = 'mutated';
    expect(service.getState().buckets[0].name).toBe('codex');
  });
  it('preserves successful data when a later read fails and does not expose raw errors', async () => {
    const service = await fixture(vi.fn().mockResolvedValueOnce(response).mockRejectedValueOnce(new Error('secret account token')));
    await service.refresh(); const before = service.getState(); await service.refresh();
    expect(service.getState()).toMatchObject({ status: 'error', buckets: before.buckets, updatedAt: before.updatedAt });
    expect(service.getState().error).not.toContain('secret');
  });
  it('aborts timed out reads, clears singleflight, and allows another refresh', async () => {
    vi.useFakeTimers(); const signals: AbortSignal[] = [];
    const service = await fixture(vi.fn((_exe, _cwd, signal) => { signals.push(signal); return new Promise(() => {}); }), 100);
    const pending = service.refresh(); await vi.advanceTimersByTimeAsync(100); await pending;
    expect(signals[0].aborted).toBe(true); expect(service.getState().status).toBe('error'); expect(service.getState().error).toContain('超时');
    const retry = service.refresh(); service.dispose(); await retry;
    expect(signals[1].aborted).toBe(true);
  });
  it('keeps unavailable discovery nonthrowing and does not spawn', async () => {
    const runner = vi.fn(); const service = new CodexQuotaService({ cwd: '.', discoverExecutable: async () => null, requestRunner: runner }); services.push(service);
    await service.init(); await service.refresh(); expect(service.getState()).toMatchObject({ status: 'unavailable', available: false }); expect(runner).not.toHaveBeenCalled();
    await expect(service.setExecutablePath('codex.cmd')).rejects.toThrow();
  });
  it('drains an aborted refresh before switching executable, clears old data, and refreshes the new executable', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'desktopplay-quota-')); directories.push(directory);
    const executable = path.join(directory, 'codex.exe'); await fs.writeFile(executable, 'MZtest-native-header');
    const runner = vi.fn().mockResolvedValueOnce(response).mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(response);
    const service = await fixture(runner); await service.refresh(); const previous = service.refresh();
    await service.setExecutablePath(executable); await previous;
    expect(service.getState()).toMatchObject({ status: 'idle', buckets: [], updatedAt: null });
    await service.refresh(); expect(runner).toHaveBeenCalledTimes(3); expect(runner.mock.calls[2][0]).toBe(executable); expect(service.getState().status).toBe('ready');
  });
});
describe('read-only app-server protocol', () => {
  it('initializes and reads quotas only, then closes the hidden native child', async () => {
    const child = childFixture(); const writes: string[] = []; child.stdin.on('data', chunk => writes.push(String(chunk)));
    const controller = new AbortController(); const pending = requestCodexQuota('C:\\codex.exe', '.', controller.signal);
    child.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\n');
    child.stdout.write(JSON.stringify({ method: 'notification', params: {} }) + '\n');
    child.stdout.write(JSON.stringify({ id: 2, result: response }) + '\n');
    await expect(pending).resolves.toEqual(response);
    expect(writes.map(line => JSON.parse(line).method)).toEqual(['initialize', 'initialized', 'account/rateLimits/read']);
    expect(spawn).toHaveBeenCalledWith('C:\\codex.exe', ['app-server'], expect.objectContaining({ shell: false, windowsHide: true })); expect(child.kill).toHaveBeenCalledOnce();
  });
  it.each(['not JSON\n', '{"id":1,"error":{"message":"private account details"}}\n', 'null\n'])('rejects malformed or failed RPC and kills the child: %s', async line => {
    const child = childFixture(); const pending = requestCodexQuota('C:\\codex.exe', '.', new AbortController().signal);
    child.stdout.write(line); await expect(pending).rejects.toThrow(); expect(child.kill).toHaveBeenCalledOnce();
  });
  it('bounds stdout and kills the child on cancellation', async () => {
    let child = childFixture(); let pending = requestCodexQuota('C:\\codex.exe', '.', new AbortController().signal);
    child.stdout.write('a'.repeat(1024 * 1024 + 1)); await expect(pending).rejects.toThrow('response-too-large'); expect(child.kill).toHaveBeenCalledOnce();
    child = childFixture(); const controller = new AbortController(); pending = requestCodexQuota('C:\\codex.exe', '.', controller.signal); controller.abort();
    await expect(pending).rejects.toThrow('aborted'); expect(child.kill).toHaveBeenCalledOnce();
  });
});
