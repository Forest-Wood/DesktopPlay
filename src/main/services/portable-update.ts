import path from 'node:path';
import { stat, unlink } from 'node:fs/promises';
import { stableVersion, type PreparedUpdate, type UpdateBackend, type UpdateCandidate, type UpdateProgress } from './app-update';
import { fileDigest, plainPath, updateFailure } from './update-files';
import { GithubUpdateTransport, type UpdateTransport } from './update-http';

const API = 'https://api.github.com/repos/Forest-Wood/DesktopPlay/releases/latest';
const DOWNLOAD = 'https://github.com/Forest-Wood/DesktopPlay/releases/download/';
type Asset = { name: string; size: number; url: string };
type Release = UpdateCandidate & { portable: Asset; sums: Asset };
const object = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
export function portableRelease(value: unknown): Release | null {
  const raw = object(value); if (!raw || raw.draft !== false || raw.prerelease !== false) return null;
  const version = stableVersion(raw.tag_name);
  if (!version || typeof raw.tag_name !== 'string' || !Array.isArray(raw.assets)) throw updateFailure('UPDATE_ASSETS');
  const entries = raw.assets;
  const assets = (name: string): Asset => {
    const found = entries.filter((v: unknown) => object(v)?.name === name);
    if (found.length !== 1) throw updateFailure('UPDATE_ASSETS'); const asset = object(found[0])!;
    const expected = `${DOWNLOAD}${encodeURIComponent(raw.tag_name as string)}/${encodeURIComponent(name)}`;
    if (asset.state !== 'uploaded' || asset.browser_download_url !== expected || !Number.isSafeInteger(asset.size) || (asset.size as number) <= 0 || (asset.size as number) > 2 * 1024 ** 3) throw updateFailure('UPDATE_ASSETS');
    return { name, size: asset.size as number, url: expected };
  };
  return { version, notes: typeof raw.body === 'string' ? raw.body.slice(0, 20000) : '', date: typeof raw.published_at === 'string' && Number.isFinite(Date.parse(raw.published_at)) ? raw.published_at : null,
    portable: assets(`DesktopPet-${version}-Portable-x64.exe`), sums: assets('SHA256SUMS.txt') };
}
export function portableChecksum(text: string, name: string): string {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const values = lines.map(line => /^([a-fA-F0-9]{64})[ \t]+\*?([^\r\n]+)$/.exec(line)).filter(line => line?.[2] === name);
  if (values.length !== 1) throw updateFailure('UPDATE_CHECKSUM'); return values[0]![1].toLowerCase();
}
interface Options { cacheDir: string; prepare: (filename: string, hash: string, version: string) => Promise<PreparedUpdate>; transport?: UpdateTransport }
export class PortableUpdateBackend implements UpdateBackend {
  private release: Release | null = null;
  private hash: string | null = null;
  private downloaded: string | null = null;
  private readonly transport: UpdateTransport;
  constructor(private readonly options: Options) { this.transport = options.transport ?? new GithubUpdateTransport(); }
  async check(signal: AbortSignal): Promise<UpdateCandidate | null> {
    this.release = null; this.hash = null; this.downloaded = null;
    const release = portableRelease(await this.transport.json(API, signal));
    if (!release) return null;
    if (release.sums.size > 65536) throw updateFailure('UPDATE_ASSETS');
    const hash = portableChecksum(await this.transport.text(release.sums.url, signal), release.portable.name);
    this.release = release; this.hash = hash; return { version: release.version, notes: release.notes, date: release.date };
  }
  async download(progress: (p: UpdateProgress) => void, signal: AbortSignal): Promise<void> {
    const release = this.release, hash = this.hash; if (!release || !hash) throw updateFailure('UPDATE_ASSETS');
    const file = path.join(this.options.cacheDir, release.portable.name); await plainPath(file);
    let cached = false;
    try { cached = (await stat(file)).size === release.portable.size && await fileDigest(file) === hash; } catch { /* Download missing cache. */ }
    signal.throwIfAborted();
    if (!cached) { await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }); await this.transport.download(release.portable.url, file, release.portable.size, hash, progress, signal); }
    if (await fileDigest(file) !== hash) throw updateFailure('UPDATE_CHECKSUM');
    this.downloaded = file; progress({ transferred: release.portable.size, total: release.portable.size });
  }
  async prepareInstall(): Promise<PreparedUpdate> {
    if (!this.release || !this.hash || !this.downloaded || await fileDigest(this.downloaded) !== this.hash) throw updateFailure('UPDATE_CHECKSUM');
    return this.options.prepare(this.downloaded, this.hash, this.release.version);
  }
}
