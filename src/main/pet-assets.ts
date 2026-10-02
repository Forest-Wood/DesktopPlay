import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { PetAsset } from '../shared/types';
import { DEFAULT_PET } from '../shared/defaults';

const MAX_BYTES = 10 * 1024 * 1024;
export function inspectImage(bytes: Buffer): { mime: string; width: number; height: number } {
  let mime = '', width = 0, height = 0;
  if (bytes.length < 16 || bytes.length > MAX_BYTES) throw new Error('图片需小于 10 MB。');
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    mime = 'image/png'; width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) {
    mime = 'image/gif'; width = bytes.readUInt16LE(6); height = bytes.readUInt16LE(8);
  } else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    mime = 'image/webp';
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const kind = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4), data = offset + 8;
      if (data + size > bytes.length) break;
      if (kind === 'VP8X' && size >= 10) { width = bytes.readUIntLE(data + 4, 3) + 1; height = bytes.readUIntLE(data + 7, 3) + 1; break; }
      if (kind === 'VP8L' && size >= 5 && bytes[data] === 0x2f) {
        width = 1 + (bytes[data + 1] | ((bytes[data + 2] & 0x3f) << 8));
        height = 1 + ((bytes[data + 2] >> 6) | (bytes[data + 3] << 2) | ((bytes[data + 4] & 15) << 10)); break;
      }
      if (kind === 'VP8 ' && size >= 10 && bytes.subarray(data + 3, data + 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
        width = bytes.readUInt16LE(data + 6) & 0x3fff; height = bytes.readUInt16LE(data + 8) & 0x3fff; break;
      }
      offset = data + size + (size % 2);
    }
  }
  if (!mime || !width || !height || width > 8192 || height > 8192 || width * height > 16_777_216) throw new Error('请选择有效的 PNG、WebP 或 GIF，图片总像素不得超过 1600 万。');
  return { mime, width, height };
}

export class PetAssets {
  private pet: PetAsset = { ...DEFAULT_PET };
  private filename: string;
  constructor(private dataDir: string) { this.filename = path.join(dataDir, 'pet.json'); }
  async init(): Promise<void> {
    try {
      const raw = await readFile(this.filename, 'utf8');
      if (raw.length > MAX_BYTES * 1.5) return;
      const stored = JSON.parse(raw) as { name?: unknown; data?: unknown };
      if (typeof stored.name !== 'string' || typeof stored.data !== 'string') return;
      const bytes = Buffer.from(stored.data, 'base64');
      const image = inspectImage(bytes);
      this.pet = { name: stored.name.slice(0, 100), url: `data:${image.mime};base64,${stored.data}`, isCustom: true };
    } catch { /* A missing or damaged user asset falls back to the packaged pet. */ }
  }
  get(): PetAsset { return { ...this.pet }; }
  async import(filename: string): Promise<void> {
    const bytes = await readFile(filename);
    const image = inspectImage(bytes), data = bytes.toString('base64'), name = path.basename(filename).slice(0, 100);
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(`${this.filename}.tmp`, JSON.stringify({ name, data }), { mode: 0o600 });
    await rename(`${this.filename}.tmp`, this.filename);
    this.pet = { name, url: `data:${image.mime};base64,${data}`, isCustom: true };
  }
  async reset(): Promise<void> {
    await unlink(this.filename).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    this.pet = { ...DEFAULT_PET };
  }
}
