import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { AppUpdateService, stableVersion, type UpdateBackend } from '../../../src/main/services/app-update';
import { formatUpdateDownloadDetail, formatUpdateEta, formatUpdateSpeed } from '../../../src/shared/app-update';
import { buildPortableBlockMap, encodePortableBlockMap, planPortablePatch } from '../../../src/shared/portable-blockmap.mjs';
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
it('accepts a major release and clears its announcement after a failed subsequent check', async () => {
  const f = await fixture({ check: vi.fn().mockResolvedValueOnce({ version: '1.0.0', notes: '- 所有桌宠新增功能。', date: '2026-10-22T00:00:00Z' }).mockRejectedValueOnce(new Error('offline')) });
  expect(await f.service.check()).toMatchObject({ status: 'available', latestVersion: '1.0.0', releaseNotes: '- 所有桌宠新增功能。' });
  expect(await f.service.check()).toMatchObject({ status: 'error', latestVersion: null, releaseNotes: '', releaseDate: null });
});
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
it('estimates smoothed download speed and remaining time, handles stalls and resets after completion or cancellation', async () => {
  let clock = 10_000;
  const snapshots: ReturnType<AppUpdateService['getState']>[] = [];
  let releaseDownload!: () => void;
  let emitProgress!: (p: { transferred: number; total: number; bytesPerSecond?: number }) => void;
  const adapter: UpdateBackend = {
    check: vi.fn(async () => candidate),
    download: vi.fn((progress, signal) => new Promise<void>((resolve, reject) => {
      emitProgress = progress;
      releaseDownload = resolve;
      signal.addEventListener('abort', () => reject(new Error('cancel')));
    })),
    prepareInstall: vi.fn(async () => ({ commit: vi.fn(async () => {}), cancel: vi.fn(async () => {}) })),
  };
  const service = new AppUpdateService({ version: '0.5.3', kind: 'portable', dataDir: await dir(), backend: adapter, now: () => clock, onState: () => snapshots.push(service.getState()) });
  services.push(service); await service.init(); await service.check();
  const job = service.download();
  const total = 10 * 1048576;
  clock = 10_200; emitProgress({ transferred: 262144, total });
  expect(service.getState()).toMatchObject({ bytesPerSecond: null, estimatedRemainingSeconds: null });
  clock = 11_000; emitProgress({ transferred: 2 * 1048576, total });
  expect(service.getState().bytesPerSecond).toBe(2 * 1048576);
  expect(service.getState().estimatedRemainingSeconds).toBe(4);
  clock = 12_000; emitProgress({ transferred: 4 * 1048576, total });
  expect(service.getState().estimatedRemainingSeconds).toBe(3);
  clock = 18_000; emitProgress({ transferred: 4 * 1048576, total });
  expect(service.getState()).toMatchObject({ bytesPerSecond: null, estimatedRemainingSeconds: null });
  clock = 18_100; emitProgress({ transferred: 5 * 1048576, total, bytesPerSecond: 1048576 });
  expect(service.getState()).toMatchObject({ bytesPerSecond: 1048576, estimatedRemainingSeconds: 5 });
  clock = 19_000; emitProgress({ transferred: total, total });
  expect(service.getState().estimatedRemainingSeconds).toBe(0);
  releaseDownload(); await job;
  expect(service.getState()).toMatchObject({ status: 'ready', progress: 100, bytesPerSecond: null, estimatedRemainingSeconds: null });
});
it('formats update speed, ETA and download detail text cleanly', () => {
  expect(formatUpdateSpeed(null)).toBe('');
  expect(formatUpdateSpeed(512)).toBe('512 B/s');
  expect(formatUpdateSpeed(256 * 1024)).toBe('256 KiB/s');
  expect(formatUpdateSpeed(2.5 * 1048576)).toBe('2.5 MiB/s');
  expect(formatUpdateEta(null)).toBe('预计剩余时间计算中…');
  expect(formatUpdateEta(0)).toBe('即将完成');
  expect(formatUpdateEta(24)).toBe('预计剩余约 24 秒');
  expect(formatUpdateEta(120)).toBe('预计剩余约 2 分钟');
  expect(formatUpdateEta(212)).toBe('预计剩余约 3 分 32 秒');
  expect(formatUpdateEta(750)).toBe('预计剩余约 12 分钟');
  expect(formatUpdateEta(3600)).toBe('预计剩余约 1 小时');
  expect(formatUpdateEta(4500)).toBe('预计剩余约 1 小时 15 分钟');
  expect(formatUpdateDownloadDetail({ status: 'available', transferred: 0, total: 100, bytesPerSecond: 10, estimatedRemainingSeconds: 10 })).toBe('');
  expect(formatUpdateDownloadDetail({ status: 'downloading', transferred: 0, total: 0, bytesPerSecond: null, estimatedRemainingSeconds: null })).toBe('正在连接下载源…');
  expect(formatUpdateDownloadDetail({ status: 'downloading', transferred: 2 * 1048576, total: 10 * 1048576, bytesPerSecond: 2 * 1048576, estimatedRemainingSeconds: 4 })).toBe('2.0 / 10.0 MiB · 2.0 MiB/s · 预计剩余约 4 秒');
});
it('assembles a portable update differentially via HTTP Range, reports delta bytes, and falls back to full download on failure', async () => {
  const work = await dir(), oldExe = path.join(work, 'old.exe'), newExe = path.join(work, 'new.exe'), cacheDir = path.join(work, 'cache');
  // Create deterministic 256 KiB binary where only a 4 KiB window in the middle changes.
  const base = Buffer.alloc(256 * 1024);
  for (let i = 0; i < base.length; i++) base[i] = (i * 31 + (i >>> 8) * 17) & 0xff;
  const updated = Buffer.from(base);
  randomBytes(4096).copy(updated, 128 * 1024);
  await writeFile(oldExe, base);
  await writeFile(newExe, updated);
  const newBlockMap = await buildPortableBlockMap(newExe, { name });
  const encodedBlockMap = encodePortableBlockMap(newBlockMap);
  const updatedSha = createHash('sha256').update(updated).digest('hex');

  const releasePayload = {
    tag_name: 'v0.5.4', draft: false, prerelease: false, body: 'notes',
    assets: [
      { name, state: 'uploaded', size: updated.length, browser_download_url: `https://github.com/Forest-Wood/DesktopPlay/releases/download/v0.5.4/${name}` },
      { name: `${name}.blockmap`, state: 'uploaded', size: encodedBlockMap.length, browser_download_url: `https://github.com/Forest-Wood/DesktopPlay/releases/download/v0.5.4/${name}.blockmap` },
      { name: 'SHA256SUMS.txt', state: 'uploaded', size: 120, browser_download_url: 'https://github.com/Forest-Wood/DesktopPlay/releases/download/v0.5.4/SHA256SUMS.txt' },
    ],
  };

  let failRange = false;
  let rangeBytesSent = 0;
  let fullDownloads = 0;
  const mockFetch: typeof fetch = vi.fn(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/releases/latest')) return new Response(JSON.stringify(releasePayload), { status: 200 });
    if (url.endsWith('/SHA256SUMS.txt')) return new Response(`${updatedSha}  ${name}\n`, { status: 200 });
    if (url.endsWith('.blockmap')) return new Response(new Uint8Array(encodedBlockMap), { status: 200 });
    const range = (init?.headers as Record<string, string> | undefined)?.Range;
    if (range) {
      if (failRange) return new Response(new Uint8Array(updated), { status: 200 });
      const m = /^bytes=(\d+)-(\d+)$/.exec(range)!;
      const start = Number(m[1]), end = Number(m[2]);
      const slice = updated.subarray(start, end + 1);
      rangeBytesSent += slice.length;
      return new Response(new Uint8Array(slice), { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${updated.length}` } });
    }
    fullDownloads += 1;
    return new Response(new Uint8Array(updated), { status: 200 });
  }) as typeof fetch;

  const progressEvents: Array<{ transferred: number; total: number }> = [];
  const backend = new PortableUpdateBackend({ cacheDir, programPath: oldExe, prepare: vi.fn(), transport: new GithubUpdateTransport(mockFetch) });
  const signal = new AbortController().signal;
  await backend.check(signal);
  await backend.download(p => progressEvents.push({ transferred: p.transferred, total: p.total }), signal);

  expect(fullDownloads).toBe(0);
  expect(rangeBytesSent).toBeGreaterThan(0);
  expect(rangeBytesSent).toBeLessThan(updated.length * 0.4);
  expect(progressEvents.at(-1)).toEqual({ transferred: rangeBytesSent, total: rangeBytesSent });
  expect(await readFile(path.join(cacheDir, name))).toEqual(updated);

  // When server stops honoring Range (returns 200), backend transparently falls back to full download.
  await rm(cacheDir, { recursive: true, force: true });
  failRange = true;
  const fallbackEvents: Array<{ transferred: number; total: number }> = [];
  await backend.download(p => fallbackEvents.push({ transferred: p.transferred, total: p.total }), signal);
  expect(fullDownloads).toBe(1);
  expect(fallbackEvents.at(-1)).toEqual({ transferred: updated.length, total: updated.length });
  expect(await readFile(path.join(cacheDir, name))).toEqual(updated);
  await expect(readFile(path.join(cacheDir, `${name}.partial`))).rejects.toThrow();

  // Abort during differential download must not fall back to full download.
  await rm(cacheDir, { recursive: true, force: true });
  failRange = false;
  const abortController = new AbortController();
  const abortFetch: typeof fetch = vi.fn(async (input, init) => {
    const url = String(input);
    if (url.endsWith('.blockmap')) { abortController.abort(); throw new DOMException('aborted', 'AbortError'); }
    return mockFetch(input, init);
  }) as typeof fetch;
  const abortBackend = new PortableUpdateBackend({ cacheDir, programPath: oldExe, prepare: vi.fn(), transport: new GithubUpdateTransport(abortFetch) });
  await abortBackend.check(new AbortController().signal);
  await expect(abortBackend.download(() => {}, abortController.signal)).rejects.toThrow();
  expect(fullDownloads).toBe(1);
});
it('coalesces small copy gaps in portable patch plans and resets ETA on differential-to-full fallback', async () => {
  const oldFile = { name, offset: 0, size: 100_000, checksums: ['a', 'b', 'c', 'd'], sizes: [20_000, 10_000, 20_000, 50_000] };
  const newFile = { name, offset: 0, size: 100_000, checksums: ['x', 'b', 'y', 'd'], sizes: [20_000, 10_000, 20_000, 50_000] };
  const plan = planPortablePatch(oldFile, newFile, { coalesceGapBytes: 16_384 });
  expect(plan).toMatchObject({ downloadRequests: 1, downloadBytes: 50_000, copyBytes: 50_000 });
  expect(planPortablePatch(oldFile, { ...newFile, checksums: ['x', 'y', 'z', 'w'] })).toBeNull();

  // Verify AppUpdateService resets speed/ETA cleanly when total jumps (differential -> full fallback).
  let clock = 10_000;
  let emitProgress!: (p: { transferred: number; total: number }) => void;
  let finish!: () => void;
  const adapter: UpdateBackend = {
    check: vi.fn(async () => candidate),
    download: vi.fn(progress => new Promise<void>(resolve => { emitProgress = progress; finish = resolve; })),
    prepareInstall: vi.fn(async () => ({ commit: vi.fn(async () => {}), cancel: vi.fn(async () => {}) })),
  };
  const service = new AppUpdateService({ version: '0.5.3', kind: 'portable', dataDir: await dir(), backend: adapter, now: () => clock });
  services.push(service); await service.init(); await service.check();
  const job = service.download();
  clock = 10_000; emitProgress({ transferred: 0, total: 5 * 1048576 });
  clock = 11_000; emitProgress({ transferred: 2 * 1048576, total: 5 * 1048576 });
  expect(service.getState()).toMatchObject({ total: 5 * 1048576, bytesPerSecond: 2 * 1048576, estimatedRemainingSeconds: 2 });
  // Fallback switches to full 100 MiB download starting at 0 transferred.
  clock = 11_500; emitProgress({ transferred: 0, total: 100 * 1048576 });
  expect(service.getState()).toMatchObject({ total: 100 * 1048576, transferred: 0, bytesPerSecond: null, estimatedRemainingSeconds: null });
  clock = 12_500; emitProgress({ transferred: 10 * 1048576, total: 100 * 1048576 });
  expect(service.getState()).toMatchObject({ bytesPerSecond: 10 * 1048576, estimatedRemainingSeconds: 9 });
  finish(); await job;
});
