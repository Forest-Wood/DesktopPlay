import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { AppUpdateService, stableVersion, type UpdateBackend } from '../../../src/main/services/app-update';
import { portableRelease, portableChecksum, PortableUpdateBackend } from '../../../src/main/services/portable-update';
import { GithubUpdateTransport } from '../../../src/main/services/update-http';
import { plainPath } from '../../../src/main/services/update-files';

const dirs: string[] = [], services: AppUpdateService[] = [];
afterEach(async () => { services.splice(0).forEach(s => s.dispose()); vi.restoreAllMocks(); vi.useRealTimers(); await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function dir() { const d = await mkdtemp(path.join(os.tmpdir(), 'desktoppet-update-')); dirs.push(d); return d; }
const candidate = { version: '0.5.4', notes: '<b>plain notes</b>', date: null };
async function fixture(backend: Partial<UpdateBackend> = {}, dataDir?: string) {
  const adapter: UpdateBackend = { check: vi.fn(async () => candidate), download: vi.fn(async p => { p({ total: 20, transferred: 20 }); }), prepareInstall: vi.fn(async () => ({ commit: vi.fn(async () => {}), cancel: vi.fn(async () => {}) })), ...backend };
  const notices = vi.fn(); const service = new AppUpdateService({ version: '0.5.3', kind: 'portable', dataDir: dataDir ?? await dir(), backend: adapter, onAvailable: notices, startupMs: 30, intervalMs: 600 });
  services.push(service); await service.init(); return { service, adapter, notices };
}
it.each(['0.5.2', '0.5.3', '0.5.4-beta.1', 'junk'])('never offers downgrade/current/prerelease/invalid %s', async version => {
  const { service } = await fixture({ check: async () => ({ ...candidate, version }) }); expect((await service.check()).status).toBe('current');
  expect((await service.download()).status).toBe('current');
});
it('accepts only stable versions', () => { expect(stableVersion('v0.5.4')).toBe('0.5.4'); expect(stableVersion(null)).toBeNull(); });
it('schedules automatic checks, suppresses repeats across restart, manual bypasses interval and disabled auto', async () => {
  const dataDir = await dir(), f = await fixture({}, dataDir); vi.useFakeTimers(); f.service.configure(true);
  await vi.advanceTimersByTimeAsync(29); expect(f.adapter.check).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); await f.service.drain(); expect(f.notices).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(600); await f.service.drain(); expect(f.adapter.check).toHaveBeenCalledTimes(2); expect(f.notices).toHaveBeenCalledTimes(1);
  f.service.dispose(); const next = await fixture({}, dataDir); next.service.configure(true);
  await vi.advanceTimersByTimeAsync(30); await next.service.drain();
  await vi.advanceTimersByTimeAsync(600); await next.service.drain(); expect(next.notices).not.toHaveBeenCalled();
  next.service.configure(false); await next.service.check(); await next.service.check(); expect(next.adapter.check).toHaveBeenCalledTimes(4);
});
it('manual discovery does not bubble and simultaneous checks/downloads share work; disposal never installs', async () => {
  let resolve!: (v: typeof candidate) => void;
  const f = await fixture({ check: vi.fn(() => new Promise<typeof candidate>(r => { resolve = r; })) });
  const one = f.service.check(), two = f.service.check(); expect(one).toBe(two); resolve(candidate); await one;
  expect(f.notices).not.toHaveBeenCalled(); await f.service.download(); expect(f.service.getState()).toMatchObject({ status: 'ready', progress: 100 });
  f.service.dispose(); expect(f.adapter.prepareInstall).not.toHaveBeenCalled();
});
it('does not re-notify a previously seen release after another release was withdrawn', async () => {
  const f = await fixture({ check: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce({ ...candidate, version: '0.5.5' }).mockResolvedValueOnce(candidate) });
  f.service.configure(true); await f.service.check(false); await f.service.check(false); await f.service.check(false);
  expect(f.notices.mock.calls.map(c => c[0])).toEqual(['0.5.4', '0.5.5']);
});
it('cancels a pending download, supports retry, and only prepares installation on explicit request', async () => {
  const f = await fixture({ download: vi.fn((_p, signal) => new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new Error('cancel'))))) });
  await f.service.check(); const one = f.service.download(); expect(f.service.download()).toBe(one);
  expect((await f.service.cancelDownload()).status).toBe('available');
  f.adapter.download = async p => { p({ transferred: 1, total: 1 }); }; await f.service.download();
  const prepared = await f.service.prepareInstall(); expect(f.service.getState().status).toBe('installing'); expect(prepared.commit).not.toHaveBeenCalled();
  await prepared.cancel(); f.service.installCancelled(); expect(f.service.getState().status).toBe('ready');
});
it.each(['UPDATE_RATE_LIMIT', 'UPDATE_ASSETS', 'UPDATE_CHECKSUM', 'ETIMEDOUT'])('sanitizes %s and retries a failed check', async code => {
  const f = await fixture({ check: vi.fn().mockRejectedValueOnce(Object.assign(new Error('secret-url-token'), { code })).mockResolvedValue(candidate) });
  expect((await f.service.check()).status).toBe('error'); expect(f.service.getState().error).not.toContain('secret');
  expect((await f.service.check()).status).toBe('available');
});
const name = 'DesktopPet-0.5.4-Portable-x64.exe', bytes = Buffer.from('fixture executable'), sha = createHash('sha256').update(bytes).digest('hex');
const release = () => ({ tag_name: 'v0.5.4', draft: false, prerelease: false, body: 'notes', assets: [name, 'SHA256SUMS.txt'].map(name => ({ name, state: 'uploaded', size: name.endsWith('.exe') ? bytes.length : 200, browser_download_url: `https://github.com/Forest-Wood/DesktopPlay/releases/download/v0.5.4/${name}` })) });
it('requires complete uploaded same-repository release assets, ignores drafts/prereleases and rejects duplicates', () => {
  expect(portableRelease(release())?.version).toBe('0.5.4');
  expect(portableRelease({ ...release(), draft: true })).toBeNull(); expect(portableRelease({ ...release(), prerelease: true })).toBeNull();
  for (const assets of [[], [...release().assets, release().assets[0]], release().assets.map(a => ({ ...a, state: 'new' })), release().assets.map(a => ({ ...a, browser_download_url: 'https://evil.test/a' }))]) expect(() => portableRelease({ ...release(), assets })).toThrow();
  expect(portableChecksum(`\uFEFF${sha} *${name}\r\n`, name)).toBe(sha);
  expect(() => portableChecksum(`${sha}  ${name}\n${sha}  ${name}`, name)).toThrow();
});
it('reuses only a fully verified cache and rejects a changed executable before install', async () => {
  const cacheDir = await dir(), prepare = vi.fn(), transport = { json: vi.fn(async () => release()), text: vi.fn(async () => `${sha}  ${name}`), download: vi.fn(async (_u: string, file: string) => { await writeFile(file, bytes); }) };
  const backend = new PortableUpdateBackend({ cacheDir, prepare, transport }); const signal = new AbortController().signal;
  await backend.check(signal); await backend.download(() => {}, signal); await backend.download(() => {}, signal); expect(transport.download).toHaveBeenCalledTimes(1);
  await writeFile(path.join(cacheDir, name), 'corrupted'); await expect(backend.prepareInstall()).rejects.toThrow(); expect(prepare).not.toHaveBeenCalled();
  await backend.download(() => {}, signal); expect(transport.download).toHaveBeenCalledTimes(2);
});
it('rejects unsafe redirect destinations and never sends credentials', async () => {
  const request = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) => new Response(null, { status: 302, headers: { location: 'http://localhost/evil' } }));
  const http = new GithubUpdateTransport(request as typeof fetch);
  await expect(http.json('https://api.github.com/test', new AbortController().signal)).rejects.toThrow(); expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'manual' });
});
it('streams progress, checks length and digest, removes partial data on mismatch or cancellation', async () => {
  const cache = await dir(), target = path.join(cache, 'new.exe'), progress = vi.fn();
  const request = vi.fn(async () => new Response(bytes)); const http = new GithubUpdateTransport(request as typeof fetch), signal = new AbortController().signal;
  await http.download('https://github.com/test', target, bytes.length, sha, progress, signal); expect(await readFile(target)).toEqual(bytes); expect(progress).toHaveBeenLastCalledWith({ total: bytes.length, transferred: bytes.length });
  await expect(http.download('https://github.com/test', target, bytes.length, '0'.repeat(64), progress, signal)).rejects.toThrow(); expect(await readFile(target)).toEqual(bytes);
  await expect(readFile(`${target}.partial`)).rejects.toThrow();
  const controller = new AbortController(); controller.abort(); await expect(http.download('https://github.com/test', target, bytes.length, sha, progress, controller.signal)).rejects.toThrow();
});
it('rejects junction targets and unsafe paths before staging', async () => {
  const root = await dir(), target = await dir(), linked = path.join(root, 'linked'); await symlink(target, linked, 'junction');
  await expect(plainPath(path.join(linked, 'new.exe'))).rejects.toThrow();
  await expect(plainPath('relative.exe')).rejects.toThrow(); await expect(plainPath('\\\\server\\pet.exe')).rejects.toThrow();
});
it.each([403, 429, 500])('handles HTTP %s as a retryable operation failure', async status => {
  const http = new GithubUpdateTransport(vi.fn(async () => new Response(null, { status })) as typeof fetch);
  await expect(http.json('https://api.github.com/test', new AbortController().signal)).rejects.toMatchObject({ code: status < 500 ? 'UPDATE_RATE_LIMIT' : 'UPDATE_NETWORK' });
});
it('aborts a stalled metadata request after its timeout', async () => {
  vi.useFakeTimers(); const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => { const controller = new AbortController(); setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), ms); return controller.signal; });
  const http = new GithubUpdateTransport(vi.fn((_url, init) => new Promise<Response>((_, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('timeout'))))) as typeof fetch);
  const pending = expect(http.json('https://api.github.com/test', new AbortController().signal)).rejects.toThrow();
  expect(timeout).toHaveBeenCalledWith(30000); await vi.advanceTimersByTimeAsync(30000); await pending;
});
