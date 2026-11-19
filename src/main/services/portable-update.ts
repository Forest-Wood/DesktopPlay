import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, open, rename, stat, unlink, type FileHandle } from 'node:fs/promises';
import { buildPortableBlockMap, parsePortableBlockMap, planPortablePatch } from '../../shared/portable-blockmap.mjs';
import { stableVersion, type PreparedUpdate, type UpdateBackend, type UpdateCandidate, type UpdateProgress } from './app-update';
import { fileDigest, plainPath, updateFailure } from './update-files';
import { GithubUpdateTransport, type UpdateTransport } from './update-http';

const API = 'https://api.github.com/repos/Forest-Wood/DesktopPlay/releases/latest';
const DOWNLOAD = 'https://github.com/Forest-Wood/DesktopPlay/releases/download/';
const MAX_BLOCKMAP_BYTES = 2 * 1024 * 1024;
const COPY_CHUNK_BYTES = 256 * 1024;

type Asset = { name: string; size: number; url: string };
type Release = UpdateCandidate & { portable: Asset; sums: Asset; blockmap: Asset | null };
const object = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;

export function portableRelease(value: unknown): Release | null {
  const raw = object(value); if (!raw || raw.draft !== false || raw.prerelease !== false) return null;
  const version = stableVersion(raw.tag_name);
  if (!version || typeof raw.tag_name !== 'string' || !Array.isArray(raw.assets)) throw updateFailure('UPDATE_ASSETS');
  const entries = raw.assets;
  const findAsset = (name: string, maxSize: number, required: boolean): Asset | null => {
    const found = entries.filter((v: unknown) => object(v)?.name === name);
    if (found.length === 0 && !required) return null;
    if (found.length !== 1) {
      if (!required) return null;
      throw updateFailure('UPDATE_ASSETS');
    }
    const asset = object(found[0])!;
    const expected = `${DOWNLOAD}${encodeURIComponent(raw.tag_name as string)}/${encodeURIComponent(name)}`;
    const valid = asset.state === 'uploaded' && asset.browser_download_url === expected && Number.isSafeInteger(asset.size) && (asset.size as number) > 0 && (asset.size as number) <= maxSize;
    if (!valid) {
      if (!required) return null;
      throw updateFailure('UPDATE_ASSETS');
    }
    return { name, size: asset.size as number, url: expected };
  };
  const portableName = `DesktopPet-${version}-Portable-x64.exe`;
  return {
    version,
    notes: typeof raw.body === 'string' ? raw.body.slice(0, 20000) : '',
    date: typeof raw.published_at === 'string' && Number.isFinite(Date.parse(raw.published_at)) ? raw.published_at : null,
    portable: findAsset(portableName, 2 * 1024 ** 3, true)!,
    sums: findAsset('SHA256SUMS.txt', 65536, true)!,
    blockmap: findAsset(`${portableName}.blockmap`, MAX_BLOCKMAP_BYTES, false),
  };
}

export function portableChecksum(text: string, name: string): string {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const values = lines.map(line => /^([a-fA-F0-9]{64})[ \t]+\*?([^\r\n]+)$/.exec(line)).filter(line => line?.[2] === name);
  if (values.length !== 1) throw updateFailure('UPDATE_CHECKSUM'); return values[0]![1].toLowerCase();
}

interface Options {
  cacheDir: string;
  programPath?: string;
  prepare: (filename: string, hash: string, version: string) => Promise<PreparedUpdate>;
  transport?: UpdateTransport;
}

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

  private async tryDifferential(release: Release, hash: string, targetFile: string, progress: (p: UpdateProgress) => void, signal: AbortSignal): Promise<boolean> {
    const programPath = this.options.programPath;
    if (!release.blockmap || !programPath || !this.transport.bytes || !this.transport.downloadRange) return false;
    const temporary = `${targetFile}.partial`;
    let sourceHandle: FileHandle | null = null;
    let targetHandle: FileHandle | null = null;
    try {
      await plainPath(programPath, true);
      await plainPath(targetFile);
      await mkdir(path.dirname(targetFile), { recursive: true });
      await plainPath(path.dirname(targetFile));
      await plainPath(temporary);

      const compressed = await this.transport.bytes(release.blockmap.url, signal, MAX_BLOCKMAP_BYTES);
      signal.throwIfAborted();
      const remoteBlockMap = parsePortableBlockMap(compressed, release.portable.name, release.portable.size);
      const localBlockMap = await buildPortableBlockMap(programPath, { signal });
      signal.throwIfAborted();

      const plan = planPortablePatch(localBlockMap.files[0], remoteBlockMap.files[0]);
      if (!plan) return false;

      sourceHandle = await open(programPath, 'r');
      targetHandle = await open(temporary, 'w', 0o600);
      const digest = createHash('sha256');
      const copyBuf = Buffer.allocUnsafe(COPY_CHUNK_BYTES);
      let written = 0;
      let downloaded = 0;
      let published = 0;
      progress({ transferred: 0, total: plan.downloadBytes });

      for (const op of plan.ops) {
        signal.throwIfAborted();
        if (op.kind === 'copy') {
          let remaining = op.size;
          let offset = op.sourceOffset;
          while (remaining > 0) {
            signal.throwIfAborted();
            const toRead = Math.min(remaining, COPY_CHUNK_BYTES);
            const { bytesRead } = await sourceHandle.read(copyBuf, 0, toRead, offset);
            if (bytesRead <= 0) throw updateFailure('UPDATE_CHECKSUM');
            const slice = copyBuf.subarray(0, bytesRead);
            digest.update(slice);
            await targetHandle.writeFile(slice);
            written += bytesRead;
            offset += bytesRead;
            remaining -= bytesRead;
          }
        } else {
          await this.transport.downloadRange(
            release.portable.url,
            op.targetOffset,
            op.targetOffset + op.size - 1,
            async chunk => {
              signal.throwIfAborted();
              digest.update(chunk);
              await targetHandle!.writeFile(chunk);
              written += chunk.length;
              downloaded += chunk.length;
              if (Date.now() - published >= 150) {
                progress({ transferred: downloaded, total: plan.downloadBytes });
                published = Date.now();
              }
            },
            signal,
          );
        }
      }

      if (written !== release.portable.size || downloaded !== plan.downloadBytes || digest.digest('hex') !== hash) {
        throw updateFailure('UPDATE_CHECKSUM');
      }
      await targetHandle.sync();
      signal.throwIfAborted();
      await targetHandle.close(); targetHandle = null;
      await sourceHandle.close(); sourceHandle = null;
      await rename(temporary, targetFile);
      progress({ transferred: plan.downloadBytes, total: plan.downloadBytes });
      return true;
    } catch (error) {
      await targetHandle?.close().catch(() => {});
      await sourceHandle?.close().catch(() => {});
      await unlink(temporary).catch(() => {});
      if (signal.aborted) throw error;
      return false;
    }
  }

  async download(progress: (p: UpdateProgress) => void, signal: AbortSignal): Promise<void> {
    const release = this.release, hash = this.hash; if (!release || !hash) throw updateFailure('UPDATE_ASSETS');
    const file = path.join(this.options.cacheDir, release.portable.name); await plainPath(file);
    let cached = false;
    try { cached = (await stat(file)).size === release.portable.size && await fileDigest(file) === hash; } catch { /* Download missing cache. */ }
    signal.throwIfAborted();
    let differential = false;
    if (!cached) {
      await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
      differential = await this.tryDifferential(release, hash, file, progress, signal);
      if (!differential) {
        signal.throwIfAborted();
        await this.transport.download(release.portable.url, file, release.portable.size, hash, progress, signal);
      }
    }
    if (await fileDigest(file) !== hash) throw updateFailure('UPDATE_CHECKSUM');
    this.downloaded = file;
    if (!differential) progress({ transferred: release.portable.size, total: release.portable.size });
  }

  async prepareInstall(): Promise<PreparedUpdate> {
    if (!this.release || !this.hash || !this.downloaded || await fileDigest(this.downloaded) !== this.hash) throw updateFailure('UPDATE_CHECKSUM');
    return this.options.prepare(this.downloaded, this.hash, this.release.version);
  }
}
