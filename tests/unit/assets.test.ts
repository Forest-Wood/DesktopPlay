import { describe, expect, it } from 'vitest';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { inspectImage, PetAssets } from '../../src/main/pet-assets';
describe('pet image validation', () => {
  it('reads the authorized bundled PNG', async () => {
    expect(inspectImage(await readFile('public/assets/whale.png'))).toEqual({ mime: 'image/png', width: 610, height: 610 });
  });
  it('rejects non-images and oversized dimensions', () => {
    expect(() => inspectImage(Buffer.from('<script>alert(1)</script>'))).toThrow();
    const gif = Buffer.alloc(24); gif.write('GIF89a'); gif.writeUInt16LE(65535, 6); gif.writeUInt16LE(65535, 8);
    expect(() => inspectImage(gif)).toThrow();
  });
  it('accepts GIF dimensions', () => {
    const gif = Buffer.alloc(24); gif.write('GIF89a'); gif.writeUInt16LE(320, 6); gif.writeUInt16LE(240, 8);
    expect(inspectImage(gif)).toEqual({ mime: 'image/gif', width: 320, height: 240 });
  });
});

describe('two independent pet profiles', () => {
  it('preserves an existing custom whale, switches and persists GPT, then resets only GPT', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'desktopplay-pets-'));
    try {
      const data = (await readFile('public/assets/whale.png')).toString('base64');
      await writeFile(path.join(directory, 'pet.json'), JSON.stringify({ name: 'my-whale.png', data }));
      const pets = new PetAssets(directory); await pets.init();
      expect(pets.getSelected()).toBe('deepseek');
      expect(pets.get()).toMatchObject({ name: 'my-whale.png', isCustom: true });
      await pets.select('gpt');
      expect(pets.get()).toMatchObject({ name: 'GPT 小伙伴', isCustom: false });
      await pets.import(path.resolve('public/assets/whale.png'));
      const restarted = new PetAssets(directory); await restarted.init();
      expect(restarted.getSelected()).toBe('gpt');
      expect(restarted.get().isCustom).toBe(true);
      await restarted.reset();
      expect(restarted.get()).toMatchObject({ url: './assets/gpt.png', isCustom: false });
      await restarted.select('deepseek');
      expect(restarted.get()).toMatchObject({ name: 'my-whale.png', isCustom: true });
      await expect(restarted.select('__proto__')).rejects.toThrow();
      expect(restarted.getSelected()).toBe('deepseek');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('uses safe defaults if persisted selection or an image is damaged', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'desktopplay-pets-'));
    try {
      await writeFile(path.join(directory, 'pet-selection.json'), '{"activePet":"unknown"}');
      await writeFile(path.join(directory, 'pet.json'), '{bad');
      const pets = new PetAssets(directory); await pets.init();
      expect(pets.getSelected()).toBe('deepseek');
      expect(pets.get().isCustom).toBe(false);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
