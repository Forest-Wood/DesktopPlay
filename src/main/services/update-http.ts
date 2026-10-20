import { open, rename, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { plainPath, updateFailure } from './update-files';
import type { UpdateProgress } from './app-update';

const hosts = new Set(['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com']);
export interface UpdateTransport {
  json(url: string, signal: AbortSignal): Promise<unknown>;
  text(url: string, signal: AbortSignal): Promise<string>;
  download(url: string, file: string, size: number, sha256: string, progress: (p: UpdateProgress) => void, signal: AbortSignal): Promise<void>;
}
/** Public HTTPS only. Do not forward cookies, tokens or user-provided request headers. */
export class GithubUpdateTransport implements UpdateTransport {
  constructor(private readonly request: typeof fetch = fetch) {}
  private async response(url: string, signal: AbortSignal, timeout: number): Promise<Response> {
    const combined = AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
    for (let redirects = 0; redirects < 6; redirects++) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !hosts.has(parsed.hostname) || parsed.username || parsed.password || parsed.port && parsed.port !== '443') throw updateFailure('UPDATE_ASSETS');
      const result = await this.request(url, { signal: combined, redirect: 'manual', credentials: 'omit', headers: { 'User-Agent': 'DesktopPet-Updater', Accept: parsed.hostname === 'api.github.com' ? 'application/vnd.github+json' : '*/*' } });
      if ([301, 302, 303, 307, 308].includes(result.status)) {
        const location = result.headers.get('location'); await result.body?.cancel();
        if (!location) throw updateFailure('UPDATE_ASSETS'); url = new URL(location, url).href; continue;
      }
      if (!result.ok) { await result.body?.cancel(); throw updateFailure(result.status === 403 || result.status === 429 ? 'UPDATE_RATE_LIMIT' : 'UPDATE_NETWORK'); }
      return result;
    }
    throw updateFailure('UPDATE_NETWORK');
  }
  private async small(url: string, signal: AbortSignal, max: number): Promise<string> {
    const response = await this.response(url, signal, 30000); if (!response.body) throw updateFailure('UPDATE_NETWORK');
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length; if (size > max) throw updateFailure('UPDATE_ASSETS'); chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  async json(url: string, signal: AbortSignal): Promise<unknown> { return JSON.parse(await this.small(url, signal, 1024 * 1024)); }
  text(url: string, signal: AbortSignal): Promise<string> { return this.small(url, signal, 65536); }
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
