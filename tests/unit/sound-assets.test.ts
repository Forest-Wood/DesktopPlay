import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectAudio, SoundAssets } from '../../src/main/sound-assets';
import type { PetPersona, SoundSlot } from '../../src/shared/types';

function wav(sample = 0): Buffer {
  const bytes = Buffer.alloc(48);
  bytes.write('RIFF'); bytes.writeUInt32LE(40, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(4, 40); bytes.writeInt16LE(sample, 44);
  return bytes;
}
function mp3(): Buffer { const frame = Buffer.alloc(417); frame.set([255, 251, 144, 0]); return Buffer.concat([frame, frame]); }
function ogg(codec = 'opus'): Buffer {
  const packet = Buffer.alloc(codec === 'opus' ? 19 : 30);
  if (codec === 'opus') { packet.write('OpusHead'); packet[8] = 1; packet[9] = 1; }
  else if (codec === 'vorbis') { packet[0] = 1; packet.write('vorbis', 1); packet[11] = 1; packet.writeUInt32LE(8000, 12); packet[29] = 1; }
  else packet.write('theora');
  const tags = Buffer.alloc(codec === 'vorbis' ? 11 : 16);
  if (codec === 'vorbis') { tags[0] = 3; tags.write('vorbis', 1); } else tags.write('OpusTags');
  const setup = Buffer.from([5, ...Buffer.from('vorbis'), 1]);
  const packets = codec === 'vorbis' ? [packet, tags, setup, Buffer.from([0, 1])] : [packet, tags, Buffer.from([0, 1])];
  const header = Buffer.alloc(27 + packets.length); header.write('OggS'); header[5] = 6; header[26] = packets.length;
  packets.forEach((value, index) => { header[27 + index] = value.length; });
  return Buffer.concat([header, ...packets]);
}
function oggLargeComments(): Buffer {
  const head = Buffer.alloc(19); head.write('OpusHead'); head[8] = 1; head[9] = 1;
  const tags = Buffer.alloc(5 * 1024 * 1024 - 32768); tags.write('OpusTags');
  const packets = [head, tags, Buffer.from([0, 1])], pages: Buffer[] = [];
  let sequence = 0;
  for (const [index, packet] of packets.entries()) {
    let at = 0, continued = false;
    while (true) {
      const lacing: number[] = [];
      const start = at;
      while (lacing.length < 255) {
        const size = Math.min(255, packet.length - at); lacing.push(size); at += size;
        if (size < 255) break;
      }
      const complete = lacing[lacing.length - 1] < 255;
      const header = Buffer.alloc(27 + lacing.length); header.write('OggS');
      header[5] = (sequence === 0 ? 2 : 0) | (continued ? 1 : 0) | (complete && index === packets.length - 1 ? 4 : 0);
      header.writeUInt32LE(1, 14); header.writeUInt32LE(sequence++, 18); header[26] = lacing.length;
      header.set(lacing, 27); pages.push(header, packet.subarray(start, at));
      if (complete) break;
      continued = true;
    }
  }
  return Buffer.concat(pages);
}
let directory: string;
beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'desktopplay-sound-test-')); });
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }); });

describe('sound format validation', () => {
  it('recognizes WAV, MP3 frames, Opus and Vorbis OGG headers', () => {
    expect(inspectAudio(wav())).toBe('wav'); expect(inspectAudio(mp3())).toBe('mp3');
    expect(inspectAudio(ogg())).toBe('ogg'); expect(inspectAudio(ogg('vorbis'))).toBe('ogg');
  });
  it('rejects random, tag-only, truncated, oversized and video files', () => {
    for (const bytes of [Buffer.from('not audio'), Buffer.from('ID3\x04\0\0\0\0\0\0'), wav().subarray(0, 44), mp3().subarray(0, 400), ogg().subarray(0, 35), ogg('video'), Buffer.alloc(5 * 1024 * 1024 + 1)]) {
      expect(() => inspectAudio(bytes)).toThrow();
    }
  });
  it('validates large continued OGG packets with bounded copying and rejects incomplete pages', () => {
    const bytes = oggLargeComments(); expect(bytes.length).toBeLessThanOrEqual(5 * 1024 * 1024);
    const concatenate = vi.spyOn(Buffer, 'concat');
    expect(inspectAudio(bytes)).toBe('ogg');
    const copiedBytes = concatenate.mock.calls.reduce((sum, [chunks]) => sum + chunks.reduce((size, chunk) => size + chunk.length, 0), 0);
    expect(copiedBytes).toBeLessThanOrEqual(bytes.length);
    concatenate.mockClear();
    expect(() => inspectAudio(bytes.subarray(0, bytes.length - 30))).toThrow();
    const rejectedCopyBytes = concatenate.mock.calls.reduce((sum, [chunks]) => sum + chunks.reduce((size, chunk) => size + chunk.length, 0), 0);
    expect(rejectedCopyBytes).toBeLessThanOrEqual(bytes.length);
  });
});

describe('SoundAssets', () => {
  it('defaults old installations to six independent built-in slots', async () => {
    const assets = new SoundAssets(directory); await assets.init();
    for (const persona of ['whale', 'gpt', 'dragon'] as const) for (const slot of ['press', 'release'] as const) {
      expect(assets.getMetadata()[persona][slot]).toMatchObject({ isCustom: false, revision: 'default', warning: null });
      expect((await assets.getData(persona, slot)).url).toBe(`./assets/${slot}.mp3`);
    }
    const copy = assets.getMetadata(); copy.whale.press.name = 'mutated'; expect(assets.getMetadata().whale.press.name).not.toBe('mutated');
  });
  it('persists all six slots and continues playing after source deletion', async () => {
    const dataDir = path.join(directory, 'data'), assets = new SoundAssets(dataDir); await assets.init();
    const pending: Promise<void>[] = [];
    for (const [index, persona] of (['whale', 'gpt', 'dragon'] as const).entries()) for (const [offset, slot] of (['press', 'release'] as const).entries()) {
      const filename = path.join(directory, `${persona}-${slot}.wav`); await writeFile(filename, wav(index * 10 + offset));
      pending.push(assets.import(filename, persona, slot));
    }
    await assets.drain(); await Promise.all(pending);
    const before = assets.getMetadata(); expect(new Set(Object.values(before).flatMap(value => Object.values(value).map(sound => sound.revision))).size).toBe(6);
    for (const file of await readdir(directory)) if (file.endsWith('.wav')) await unlink(path.join(directory, file));
    const restarted = new SoundAssets(dataDir); await restarted.init(); expect(restarted.getMetadata()).toEqual(before);
    for (const persona of ['whale', 'gpt', 'dragon'] as const) for (const slot of ['press', 'release'] as const) {
      expect(restarted.getMetadata()[persona][slot].isCustom).toBe(true);
      expect((await restarted.getData(persona, slot)).url).toMatch(/^data:audio\/wav;base64,/);
    }
    expect(JSON.stringify(before)).not.toContain('data:');
  });
  it('preserves previous sound on invalid imports and keeps queue usable', async () => {
    const assets = new SoundAssets(path.join(directory, 'data')), valid = path.join(directory, 'valid.wav'); await writeFile(valid, wav());
    await assets.import(valid, 'gpt', 'release'); const before = assets.getMetadata();
    for (const [name, bytes] of [['bad.wav', Buffer.from('invalid')], ['huge.mp3', Buffer.alloc(5 * 1024 * 1024 + 1)], ['truncated.wav', wav().subarray(0, 43)], ['disguised.mp3', wav()], ['sound.exe', wav()]] as const) {
      const filename = path.join(directory, name); await writeFile(filename, bytes);
      await expect(assets.import(filename, 'gpt', 'release')).rejects.toThrow(); expect(assets.getMetadata()).toEqual(before);
    }
    await assets.reset('gpt', 'release'); expect(assets.getMetadata().gpt.release.isCustom).toBe(false);
  });
  it('falls back with warning and new revision for missing or damaged content', async () => {
    const dataDir = path.join(directory, 'data'), assets = new SoundAssets(dataDir), filename = path.join(directory, 'valid.wav'); await writeFile(filename, wav());
    await assets.import(filename, 'whale', 'press'); await assets.import(filename, 'dragon', 'release');
    const before = assets.getMetadata(), manifest = JSON.parse(await readFile(path.join(dataDir, 'sounds', 'manifest.json'), 'utf8'));
    await writeFile(path.join(dataDir, 'sounds', manifest.whale.press.file), wav(42));
    await unlink(path.join(dataDir, 'sounds', manifest.dragon.release.file));
    for (const [persona, slot] of [['whale', 'press'], ['dragon', 'release']] as const) {
      const data = await assets.getData(persona, slot);
      expect(data.url).toBe(`./assets/${slot}.mp3`); expect(data.warning).toBeTruthy(); expect(data.revision).not.toBe(before[persona][slot].revision);
      expect(assets.getMetadata()[persona][slot].isCustom).toBe(false);
      expect(await assets.getData(persona, slot)).toEqual(data);
    }
    await assets.import(filename, 'whale', 'press'); expect(assets.getMetadata().whale.press.warning).toBeNull();
  });
  it('resets one slot atomically and remembers reset after restart', async () => {
    const assets = new SoundAssets(directory), filename = path.join(directory, 'valid.wav'); await writeFile(filename, wav());
    await assets.import(filename, 'gpt', 'press'); await assets.import(filename, 'gpt', 'release');
    const release = assets.getMetadata().gpt.release;
    const pending = assets.reset('gpt', 'press'); await assets.drain(); await pending;
    const restarted = new SoundAssets(directory); await restarted.init();
    expect(restarted.getMetadata().gpt.press.isCustom).toBe(false); expect(restarted.getMetadata().gpt.release).toEqual(release);
    expect((await readdir(path.join(directory, 'sounds'))).filter(file => file.endsWith('.wav'))).toHaveLength(1);
  });
  it('rejects arbitrary enum inputs and ignores manifest path traversal', async () => {
    const assets = new SoundAssets(directory);
    expect(() => assets.getData('__proto__' as PetPersona, 'press')).toThrow();
    expect(() => assets.reset('gpt', '../release' as SoundSlot)).toThrow();
    expect(() => assets.import('x.wav', 'custom' as PetPersona, 'press')).toThrow();
    const filename = path.join(directory, 'valid.wav'); await writeFile(filename, wav()); await assets.import(filename, 'gpt', 'press');
    const manifestPath = path.join(directory, 'sounds', 'manifest.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.gpt.press.file = '../../valid.wav'; await writeFile(manifestPath, JSON.stringify(manifest));
    const restarted = new SoundAssets(directory); await restarted.init();
    expect((await restarted.getData('gpt', 'press')).url).toBe('./assets/press.mp3'); expect(restarted.getMetadata().gpt.press.warning).toBeTruthy();
  });
  it('warns on a damaged manifest and safely ignores uncommitted orphan files', async () => {
    const assets = new SoundAssets(directory), filename = path.join(directory, 'valid.wav'); await writeFile(filename, wav());
    await assets.import(filename, 'gpt', 'press');
    const manifestPath = path.join(directory, 'sounds', 'manifest.json'), manifest = await readFile(manifestPath, 'utf8');
    await writeFile(path.join(directory, 'sounds', 'dragon-release-uncommitted.wav'), wav());
    const restored = new SoundAssets(directory); await restored.init();
    expect(restored.getMetadata().gpt.press.isCustom).toBe(true); expect(restored.getMetadata().dragon.release.isCustom).toBe(false);
    await writeFile(manifestPath, '{broken');
    const broken = new SoundAssets(directory); await broken.init();
    expect((await broken.getData('gpt', 'press')).url).toBe('./assets/press.mp3'); expect(broken.getMetadata().gpt.press.warning).toBeTruthy();
    // A restored valid manifest still points to the committed file after a simulated crash.
    await writeFile(manifestPath, manifest); const recovered = new SoundAssets(directory); await recovered.init();
    expect((await recovered.getData('gpt', 'press')).url).toMatch(/^data:audio\/wav;base64,/);
  });
});
