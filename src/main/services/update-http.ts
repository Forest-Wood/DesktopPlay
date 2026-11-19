import { open, rename, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { plainPath, updateFailure } from './update-files';
import type { UpdateProgress } from './app-update';

const hosts = new Set(['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com']);
export interface UpdateTransport {
  json(url: string, signal: AbortSignal): Promise<unknown>;
  text(url: string, signal: AbortSignal): Promise<string>;
  bytes?(url: string, signal: AbortSignal, maxBytes?: number): Promise<Buffer>;
  downloadRange?(url: string, start: number, endInclusive: number, onChunk: (chunk: Uint8Array) => Promise<void>, signal: AbortSignal): Promise<void>;
  download(url: string, file: string, size: number, sha256: string, progress: (p: UpdateProgress) => void, signal: AbortSignal): Promise<void>;
}
/** Public HTTPS only. Do not forward cookies, tokens or user-provided request headers. */
export class GithubUpdateTransport implements UpdateTransport {
  constructor(private readonly request: typeof fetch = fetch) {}
  private async response(url: string, signal: AbortSignal, timeout: number, range?: { start: number; end: number }): Promise<Response> {
    if (range && (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start)) {
      throw updateFailure('UPDATE_ASSETS');
    }
    const combined = AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
    for (let redirects = 0; redirects < 6; redirects++) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !hosts.has(parsed.hostname) || parsed.username || parsed.password || parsed.port && parsed.port !== '443') throw updateFailure('UPDATE_ASSETS');
      const headers: Record<string, string> = { 'User-Agent': 'DesktopPet-Updater', Accept: parsed.hostname === 'api.github.com' ? 'application/vnd.github+json' : '*/*' };
      if (range) headers.Range = `bytes=${range.start}-${range.end}`;
      const result = await this.request(url, { signal: combined, redirect: 'manual', credentials: 'omit', headers });
      if ([301, 302, 303, 307, 308].includes(result.status)) {
        const location = result.headers.get('location'); await result.body?.cancel();
        if (!location) throw updateFailure('UPDATE_ASSETS'); url = new URL(location, url).href; continue;
      }
      if (range) {
        if (result.status !== 206) { await result.body?.cancel(); throw updateFailure(result.status === 403 || result.status === 429 ? 'UPDATE_RATE_LIMIT' : 'UPDATE_NETWORK'); }
        const contentRange = result.headers.get('content-range');
        if (contentRange && !contentRange.toLowerCase().startsWith(`bytes ${range.start}-${range.end}/`)) {
          await result.body?.cancel(); throw updateFailure('UPDATE_NETWORK');
        }
        return result;
      }
      if (!result.ok) { await result.body?.cancel(); throw updateFailure(result.status === 403 || result.status === 429 ? 'UPDATE_RATE_LIMIT' : 'UPDATE_NETWORK'); }
      return result;
    }
    throw updateFailure('UPDATE_NETWORK');
  }
  async bytes(url: string, signal: AbortSignal, max = 2 * 1024 * 1024): Promise<Buffer> {
    const response = await this.response(url, signal, 30000); if (!response.body) throw updateFailure('UPDATE_NETWORK');
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of response.body) {
      signal.throwIfAborted();
      size += chunk.length; if (size > max) throw updateFailure('UPDATE_ASSETS'); chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async json(url: string, signal: AbortSignal): Promise<unknown> { return JSON.parse((await this.bytes(url, signal, 1024 * 1024)).toString('utf8')); }
  async text(url: string, signal: AbortSignal): Promise<string> { return (await this.bytes(url, signal, 65536)).toString('utf8'); }
  async downloadRange(url: string, start: number, endInclusive: number, onChunk: (chunk: Uint8Array) => Promise<void>, signal: AbortSignal): Promise<void> {
    const expected = endInclusive - start + 1;
    const response = await this.response(url, signal, 5 * 60 * 1000, { start, end: endInclusive });
    if (!response.body) throw updateFailure('UPDATE_NETWORK');
    let received = 0;
    for await (const chunk of response.body) {
      signal.throwIfAborted();
      received += chunk.length;
      if (received > expected) { await response.body.cancel().catch(() => {}); throw updateFailure('UPDATE_NETWORK'); }
      await onChunk(chunk);
    }
    if (received !== expected) throw updateFailure('UPDATE_NETWORK');
  }
  async download(url: string, filename: string, size: number, sha256: string, progress: (p: UpdateProgress) => void, signal: AbortSignal): Promise<void> {
    await plainPath(filename); await mkdir(path.dirname(filename), { recursive: true }); await plainPath(path.dirname(filename));
    const temporary = `${filename}.partial`; await plainPath(temporary);
    const response = await this.response(url, signal, 30 * 60 * 1000);
    if (!response.body) throw updateFailure('UPDATE_NETWORK');
    const handle = await open(temporary, 'w', 0o600); const hash = createHash('sha256'); let transferred = 0, published = 0;
    try {
      for await (const chunk of response.body) {
        signal.throwIfAborted(); transferred += chunk.length;
        if (transferred > size) throw updateFailure('UPDATE_CHECKSUM');
        hash.update(chunk); await handle.writeFile(chunk);
        if (Date.now() - published >= 150) { progress({ transferred, total: size }); published = Date.now(); }
      }
      if (transferred !== size || hash.digest('hex') !== sha256) throw updateFailure('UPDATE_CHECKSUM');
      await handle.sync(); signal.throwIfAborted();
    } catch (error) { await handle.close(); await unlink(temporary).catch(() => {}); throw error; }
    await handle.close(); await rename(temporary, filename); progress({ transferred, total: size });
  }
}
