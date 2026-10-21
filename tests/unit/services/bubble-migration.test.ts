import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DesktopService } from '../../../src/main/services/desktop-service';
import { DEFAULT_SETTINGS } from '../../../src/shared/defaults';
import { PERSONAS } from '../../../src/shared/bubble-settings';

const directories: string[] = [], services: DesktopService[] = [];
const secrets = { isEncryptionAvailable: () => true, encryptString: (text: string) => Buffer.from(text), decryptString: (bytes: Buffer) => bytes.toString() };
async function start(directory: string) { const service = new DesktopService({ dataDir: directory, secrets }); services.push(service); await service.init(); return service; }
afterEach(async () => { for (const service of services.splice(0)) { service.dispose(); await service.drain(); } await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('bubble profile persistence and migration', () => {
  it('migrates v0.5.3 times, shared completion switch, custom messages and phrases without changing account data', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'desktoppet-bubble-')); directories.push(directory);
    const settings = { ...structuredClone(DEFAULT_SETTINGS), bubbleDurationSeconds: 7, bubbleHoverDelaySeconds: 4, codexCompletionEnabled: false, completionMessagesByPersona: { whale: '鲸鱼旧文案', gpt: 'GPT 旧文案', dragon: '白龙旧文案' } } as Record<string, unknown>;
    for (const key of ['bubbleProfilesByPersona', 'chatgptCompletionEnabled', 'deepseekCompletionEnabled', 'deepseekCompletionDirectory']) delete settings[key];
    await writeFile(path.join(directory, 'desktopplay.json'), JSON.stringify({ version: 1, settings, key: null, accounts: {} }));
    const service = await start(directory), migrated = service.getState().settings;
    expect(migrated).toMatchObject({ codexCompletionEnabled: false, chatgptCompletionEnabled: false, deepseekCompletionEnabled: true, deepseekCompletionDirectory: null, phrasesByPersona: settings.phrasesByPersona });
    for (const persona of PERSONAS) {
      expect(migrated.bubbleProfilesByPersona[persona].timing).toEqual({ durationSeconds: 7, hoverDelaySeconds: 4 });
      expect(migrated.bubbleProfilesByPersona[persona].rules['completion-codex'].message).toBe(migrated.completionMessagesByPersona[persona]);
      expect(migrated.bubbleProfilesByPersona[persona].rules['completion-chatgpt-work'].message).toBe(migrated.completionMessagesByPersona[persona]);
      expect(migrated.bubbleProfilesByPersona[persona].rules['completion-deepseek-harness'].soundEnabled).toBe(false);
    }
    migrated.bubbleProfilesByPersona.dragon.rules['completion-deepseek-harness'].message = 'DSH 新文案';
    migrated.bubbleProfilesByPersona.dragon.rules['completion-deepseek-harness'].soundEnabled = true;
    await service.updateSettings({ bubbleProfilesByPersona: migrated.bubbleProfilesByPersona, chatgptCompletionEnabled: true, deepseekCompletionDirectory: path.join(directory, 'fake-sessions') }); service.dispose();
    const restarted = await start(directory); expect(restarted.getState().settings.bubbleProfilesByPersona).toEqual(migrated.bubbleProfilesByPersona);
    expect(restarted.getState().settings).toMatchObject({ codexCompletionEnabled: false, chatgptCompletionEnabled: true });
    expect(JSON.parse(await readFile(path.join(directory, 'desktopplay.json'), 'utf8'))).toMatchObject({ key: null, accounts: {} });
  });
  it('rejects invalid profile or source settings atomically, including persisted bytes', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'desktoppet-bubble-')); directories.push(directory);
    const service = await start(directory); await service.updateSettings({ volume: .25 }); const before = service.getState().settings, file = path.join(directory, 'desktopplay.json'), bytes = await readFile(file, 'utf8');
    const bad = structuredClone(before.bubbleProfilesByPersona); bad.whale.rules.update.style = { fontScale: 9 };
    for (const patch of [{ bubbleProfilesByPersona: bad }, { deepseekCompletionDirectory: 'relative' }, { chatgptCompletionEnabled: 'yes' }]) {
      await expect(service.updateSettings({ volume: .9, ...patch } as never)).rejects.toThrow(); expect(service.getState().settings).toEqual(before); expect(await readFile(file, 'utf8')).toBe(bytes);
    }
  });
});
