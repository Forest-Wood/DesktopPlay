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
  it('migrates legacy GPT custom images and keeps them across built-in switches and restarts', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'desktopplay-pets-'));
    try {
      const custom = { name: 'legacy-gpt.png', data: (await readFile('public/assets/whale.png')).toString('base64') };
      await writeFile(path.join(directory, 'gpt-pet.json'), JSON.stringify(custom));
      await writeFile(path.join(directory, 'pet-selection.json'), JSON.stringify({ activePet: 'gpt' }));
      const pets = new PetAssets(directory); await pets.init();
      expect(pets.getGptAppearance()).toBe('custom');
      expect(pets.get()).toMatchObject({ name: custom.name, isCustom: true });
      await pets.selectGptAppearance('dragon');
      expect(pets.get()).toMatchObject({ url: './assets/gpt-dragon-v2.png', isCustom: false });
      expect(JSON.parse(await readFile(path.join(directory, 'gpt-pet.json'), 'utf8'))).toEqual(custom);
      const restarted = new PetAssets(directory); await restarted.init();
      expect(restarted.getGptAppearance()).toBe('dragon');
      expect(restarted.hasCustomGpt()).toBe(true);
      await restarted.selectGptAppearance('classic');
      expect(restarted.get().url).toBe('./assets/gpt.png');
      await restarted.selectGptAppearance('custom');
      expect(restarted.get()).toMatchObject({ name: custom.name, isCustom: true });
      await restarted.reset();
      expect(restarted.getGptAppearance()).toBe('classic');
      expect(restarted.hasCustomGpt()).toBe(false);
      await expect(readFile(path.join(directory, 'gpt-pet.json'))).rejects.toMatchObject({ code: 'ENOENT' });
      const resetRestart = new PetAssets(directory); await resetRestart.init();
      expect(resetRestart.getGptAppearance()).toBe('classic');
      await expect(resetRestart.selectGptAppearance('custom')).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('serializes independent character and appearance choices and recovers after invalid choices', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'desktopplay-pets-'));
    try {
      const pets = new PetAssets(directory); await pets.init();
      expect(pets.getGptAppearance()).toBe('classic');
      await expect(pets.selectGptAppearance('__proto__')).rejects.toThrow();
      await expect(pets.selectGptAppearance('custom')).rejects.toThrow();
      await Promise.all([pets.selectGptAppearance('dragon'), pets.select('gpt'), pets.selectGptAppearance('classic')]);
      expect(JSON.parse(await readFile(path.join(directory, 'pet-selection.json'), 'utf8'))).toEqual({ activePet: 'gpt', gptAppearance: 'classic' });
      await pets.selectGptAppearance('dragon');
      await pets.select('deepseek');
      expect(pets.get().url).toBe('./assets/whale.png');
      const restarted = new PetAssets(directory); await restarted.init();
      expect(restarted.getSelected()).toBe('deepseek');
      expect(restarted.getGptAppearance()).toBe('dragon');
      await restarted.select('gpt');
      expect(restarted.get().url).toBe('./assets/gpt-dragon-v2.png');
      await restarted.import(path.resolve('public/assets/whale.png'));
      expect(restarted.getGptAppearance()).toBe('custom');
      const importedRestart = new PetAssets(directory); await importedRestart.init();
      expect(importedRestart.getGptAppearance()).toBe('custom');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it.each(['custom', 'unknown'])('falls back safely from persisted %s appearance and damaged custom data', async appearance => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'desktopplay-pets-'));
    try {
      await writeFile(path.join(directory, 'gpt-pet.json'), JSON.stringify({ name: 'bad.png', data: 'not an image' }));
      await writeFile(path.join(directory, 'pet-selection.json'), JSON.stringify({ activePet: 'gpt', gptAppearance: appearance }));
      const pets = new PetAssets(directory); await pets.init();
      expect(pets.getSelected()).toBe('gpt');
      expect(pets.getGptAppearance()).toBe('classic');
      expect(pets.hasCustomGpt()).toBe(false);
      expect(pets.get().url).toBe('./assets/gpt.png');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
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
