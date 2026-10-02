import { mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DEFAULT_SOUNDS } from '../shared/defaults';
import type { PetPersona, SoundSlot, SoundMetadataMap, SoundData } from '../shared/types';

const MAX_BYTES = 5 * 1024 * 1024;
const PERSONAS = ['whale', 'gpt', 'dragon'] as const;
const SLOTS = ['press', 'release'] as const;
type Format = 'mp3' | 'wav' | 'ogg';
interface Entry { name: string; revision: string; file: string; hash: string }
type Manifest = Partial<Record<PetPersona, Partial<Record<SoundSlot, Entry>>>>;
function validate(persona: unknown, slot: unknown): asserts persona is PetPersona {
  if (!PERSONAS.includes(persona as PetPersona) || !SLOTS.includes(slot as SoundSlot)) throw new Error('未知的音效人设或槽位。');
}
async function boundedRead(filename: string, limit: number): Promise<Buffer> {
  const handle = await open(filename, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > limit) throw new Error('请选择不超过 5 MiB 的有效音频文件。');
    const buffer = Buffer.alloc(Math.min(stat.size + 1, limit + 1));
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== stat.size) throw new Error('读取时文件发生变化，请重新选择。');
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}

/** Check complete container/frame boundaries, rather than trusting extension or an ID3 tag. */
export function inspectAudio(bytes: Buffer): Format {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('音频文件不得超过 5 MiB。');
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') {
    if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error('Truncated WAV file.');
    let fmt = false, data = false, alignment = 0;
    for (let at = 12; at < bytes.length;) {
      if (at + 8 > bytes.length) throw new Error('Truncated WAV chunk.');
      const size = bytes.readUInt32LE(at + 4), start = at + 8, kind = bytes.toString('ascii', at, at + 4);
      if (start + size + (size % 2) > bytes.length) throw new Error('Truncated WAV chunk.');
      if (kind === 'fmt ') {
        if (size < 16) throw new Error('Invalid WAV format.');
        const codec = bytes.readUInt16LE(start), channels = bytes.readUInt16LE(start + 2), rate = bytes.readUInt32LE(start + 4), bits = bytes.readUInt16LE(start + 14);
        alignment = bytes.readUInt16LE(start + 12);
        if (![1, 3].includes(codec) || channels < 1 || channels > 8 || !rate || ![8, 16, 24, 32, 64].includes(bits) || alignment !== channels * bits / 8) throw new Error('Unsupported WAV audio.');
        fmt = true;
      }
      if (kind === 'data') { if (!fmt || !size || size % alignment) throw new Error('Invalid WAV audio data.'); data = true; }
      at = start + size + (size % 2);
    }
    if (fmt && data) return 'wav';
    throw new Error('Missing WAV audio data.');
  }
  if (bytes.toString('ascii', 0, 4) === 'OggS') {
    const streams = new Map<number, { sequence: number; ended: boolean; packetChunks: Buffer[]; packetBytes: number; codec: 'opus' | 'vorbis' | null; packets: number }>();
    for (let at = 0; at < bytes.length;) {
      if (at + 27 > bytes.length || bytes.toString('ascii', at, at + 4) !== 'OggS' || bytes[at + 4] !== 0) throw new Error('Invalid OGG page.');
      const flags = bytes[at + 5], serial = bytes.readUInt32LE(at + 14), sequence = bytes.readUInt32LE(at + 18), count = bytes[at + 26];
      if (at + 27 + count > bytes.length) throw new Error('Truncated OGG page.');
      const segments = bytes.subarray(at + 27, at + 27 + count), length = segments.reduce((sum, value) => sum + value, 0);
      let cursor = at + 27 + count;
      if (cursor + length > bytes.length) throw new Error('Truncated OGG data.');
      let stream = streams.get(serial);
      if (!stream) {
        if (!(flags & 2) || sequence !== 0) throw new Error('Missing OGG stream header.');
        stream = { sequence: -1, ended: false, packetChunks: [], packetBytes: 0, codec: null, packets: 0 }; streams.set(serial, stream);
      }
      if (stream.ended || sequence !== stream.sequence + 1 || Boolean(flags & 1) !== Boolean(stream.packetBytes)) throw new Error('Invalid OGG sequence.');
      stream.sequence = sequence;
      for (const size of segments) {
        if (stream.packetBytes + size > MAX_BYTES) throw new Error('OGG audio packet exceeds the file size limit.');
        if (size) stream.packetChunks.push(bytes.subarray(cursor, cursor + size));
        stream.packetBytes += size; cursor += size;
        if (size < 255) {
          // A packet can span thousands of lacing segments. Copy it only once,
          // when complete, to keep validation linear in the bounded file size.
          const packet = Buffer.concat(stream.packetChunks, stream.packetBytes);
          if (!stream.codec) {
            const opus = packet.length >= 19 && packet.toString('ascii', 0, 8) === 'OpusHead' && packet[8] === 1 && packet[9] > 0;
            const vorbis = packet.length >= 30 && packet[0] === 1 && packet.toString('ascii', 1, 7) === 'vorbis' && packet.readUInt32LE(7) === 0 && packet[11] > 0 && packet.readUInt32LE(12) > 0 && Boolean(packet[29] & 1);
            if (!opus && !vorbis) throw new Error('OGG must contain Vorbis or Opus audio only.');
            stream.codec = opus ? 'opus' : 'vorbis';
          } else if (stream.packets === 1) {
            if (stream.codec === 'opus' ? packet.length < 16 || packet.toString('ascii', 0, 8) !== 'OpusTags' : packet.length < 11 || packet[0] !== 3 || packet.toString('ascii', 1, 7) !== 'vorbis') throw new Error('Missing OGG audio comments.');
          } else if (stream.codec === 'vorbis' && stream.packets === 2) {
            if (packet.length < 8 || packet[0] !== 5 || packet.toString('ascii', 1, 7) !== 'vorbis') throw new Error('Missing Vorbis setup header.');
          }
          stream.packets++;
          stream.packetChunks = []; stream.packetBytes = 0;
        }
      }
      stream.ended = Boolean(flags & 4); at = cursor;
    }
    if (!streams.size || [...streams.values()].some(stream => !stream.codec || !stream.ended || stream.packetBytes || stream.packets < (stream.codec === 'opus' ? 3 : 4))) throw new Error('Incomplete OGG audio.');
    return 'ogg';
  }
  let at = 0, frames = 0;
  if (bytes.toString('ascii', 0, 3) === 'ID3') {
    if (bytes.length < 10 || bytes[3] < 2 || bytes[3] > 4 || bytes.subarray(6, 10).some(value => value & 128)) throw new Error('Invalid MP3 tag.');
    at = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]) + ((bytes[5] & 16) ? 10 : 0);
  }
  while (at < bytes.length) {
    if (bytes.length - at === 128 && bytes.toString('ascii', at, at + 3) === 'TAG') { at += 128; break; }
    if (at + 4 > bytes.length || bytes[at] !== 255 || (bytes[at + 1] & 224) !== 224) throw new Error('Invalid MP3 frame.');
    const version = (bytes[at + 1] >> 3) & 3, layer = (bytes[at + 1] >> 1) & 3, bitrate = bytes[at + 2] >> 4, sample = (bytes[at + 2] >> 2) & 3;
    if (version === 1 || layer !== 1 || bitrate === 0 || bitrate === 15 || sample === 3) throw new Error('Unsupported MP3 audio.');
    const rates = version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const frequency = [44100, 48000, 32000][sample] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const length = Math.floor((version === 3 ? 144 : 72) * rates[bitrate] * 1000 / frequency) + ((bytes[at + 2] >> 1) & 1);
    if (at + length > bytes.length) throw new Error('Truncated MP3 frame.');
    at += length; frames++;
  }
  if (frames && at === bytes.length) return 'mp3';
  throw new Error('Select a valid MP3, WAV or OGG audio file.');
}

export class SoundAssets {
  private metadata = structuredClone(DEFAULT_SOUNDS);
  private entries: Manifest = {};
  private mutations: Promise<void> = Promise.resolve();
  private get directory(): string { return path.join(this.dataDir, 'sounds'); }
  private get manifestPath(): string { return path.join(this.directory, 'manifest.json'); }
  constructor(private dataDir: string) {}
  async init(): Promise<void> {
    let raw: unknown;
    const damagedManifest = () => {
      for (const persona of PERSONAS) for (const slot of SLOTS) this.metadata[persona][slot].warning = '已保存的音效信息损坏，已回退内置音效。';
    };
    try { raw = JSON.parse((await boundedRead(this.manifestPath, 16384)).toString('utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') damagedManifest(); return; }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { damagedManifest(); return; }
    for (const persona of PERSONAS) for (const slot of SLOTS) {
      const value = (raw as Manifest)[persona]?.[slot];
      if (!value) continue;
      if (typeof value.name !== 'string' || value.name.length > 255 || typeof value.revision !== 'string' || !/^[0-9a-f-]{36}$/.test(value.revision) || typeof value.file !== 'string' || !['mp3', 'wav', 'ogg'].some(format => value.file === `${persona}-${slot}-${value.revision}.${format}`) || typeof value.hash !== 'string' || !/^[0-9a-f]{64}$/.test(value.hash)) {
        this.metadata[persona][slot].warning = '已保存的音效信息损坏，已回退内置音效。'; continue;
      }
      (this.entries[persona] ??= {})[slot] = value;
      this.metadata[persona][slot] = { name: value.name, isCustom: true, revision: value.revision, warning: null };
    }
  }
  getMetadata(): SoundMetadataMap { return structuredClone(this.metadata); }
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutations.catch(() => {}).then(operation); this.mutations = next.then(() => {}, () => {}); return next;
  }
  async drain(): Promise<void> { await this.mutations; }
  private async atomicSave(filename: string, bytes: Buffer | string): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, filename);
    } finally { await unlink(temporary).catch(() => {}); }
  }
  getData(persona: PetPersona, slot: SoundSlot): Promise<SoundData> {
    validate(persona, slot);
    return this.mutate(async () => {
      const entry = this.entries[persona]?.[slot];
      if (entry && this.metadata[persona][slot].isCustom) {
        try {
          const bytes = await boundedRead(path.join(this.directory, entry.file), MAX_BYTES), format = inspectAudio(bytes);
          if (createHash('sha256').update(bytes).digest('hex') !== entry.hash) throw new Error('Audio content changed.');
          return { url: `data:audio/${format === 'mp3' ? 'mpeg' : format};base64,${bytes.toString('base64')}`, revision: entry.revision, warning: null };
        } catch {
          this.metadata[persona][slot] = { ...DEFAULT_SOUNDS[persona][slot], revision: `${entry.revision}-fallback`, warning: '自定义音效已丢失或损坏，已回退内置音效。' };
        }
      }
      return { url: `./assets/${slot}.mp3`, revision: this.metadata[persona][slot].revision, warning: this.metadata[persona][slot].warning };
    });
  }
  import(filename: string, persona: PetPersona, slot: SoundSlot): Promise<void> {
    validate(persona, slot);
    return this.mutate(async () => {
      if (typeof filename !== 'string' || !['.mp3', '.wav', '.ogg'].includes(path.extname(filename).toLowerCase())) throw new Error('请选择 MP3、WAV 或 OGG 文件。');
      const bytes = await boundedRead(filename, MAX_BYTES);
      let format: Format;
      try { format = inspectAudio(bytes); } catch { throw new Error('音频格式无效、内容不完整或包含不支持的编码，请选择 MP3、WAV 或 OGG 音频。'); }
      const revision = randomUUID();
      if (path.extname(filename).toLowerCase() !== `.${format}`) throw new Error('文件扩展名与实际音频格式不一致。');
      const entry = { name: path.basename(filename), revision, file: `${persona}-${slot}-${revision}.${format}`, hash: createHash('sha256').update(bytes).digest('hex') };
      const next = structuredClone(this.entries); (next[persona] ??= {})[slot] = entry;
      const previous = this.entries[persona]?.[slot];
      await this.atomicSave(path.join(this.directory, entry.file), bytes);
      try { await this.atomicSave(this.manifestPath, JSON.stringify(next)); }
      catch (error) { await unlink(path.join(this.directory, entry.file)).catch(() => {}); throw error; }
      this.entries = next; this.metadata[persona][slot] = { name: entry.name, isCustom: true, revision, warning: null };
      if (previous) await unlink(path.join(this.directory, previous.file)).catch(() => {});
    });
  }
  reset(persona: PetPersona, slot: SoundSlot): Promise<void> {
    validate(persona, slot);
    return this.mutate(async () => {
      const previous = this.entries[persona]?.[slot], next = structuredClone(this.entries);
      if (next[persona]) delete next[persona]![slot];
      await this.atomicSave(this.manifestPath, JSON.stringify(next));
      this.entries = next; this.metadata[persona][slot] = { ...DEFAULT_SOUNDS[persona][slot] };
      if (previous) await unlink(path.join(this.directory, previous.file)).catch(() => {});
    });
  }
}
