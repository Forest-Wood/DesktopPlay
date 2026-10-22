import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { electronArgs } from './electron-args';
import type { ConversationNotice } from '../../src/shared/types';

async function launch(profile?: string) {
  await mkdir('.tmp', { recursive: true }); profile ??= await mkdtemp(path.resolve('.tmp/smoke-attention-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  return { profile, app: await electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env }) };
}
test('conversation bubbles stay until body click across personas, order waiting before queued completions, and discard hidden events', async () => {
  const { app } = await launch();
  try {
    const pet = await app.firstWindow(); await expect(pet.locator('.pet-character')).toBeVisible(); await pet.clock.install();
    await pet.evaluate(() => window.desktopPlay.openSettings()); const settings = app.windows().find(window => window !== pet) ?? await app.waitForEvent('window'); await settings.bringToFront();
    const focused = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id);
    const send = async (id: string, kind: ConversationNotice['kind'], source: ConversationNotice['source']) => app.evaluate(({ BrowserWindow }, notice) => { BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'))!.webContents.send('desktopplay:conversation-notice', notice); }, { id, kind, source, occurredAt: new Date().toISOString() });
    for (const owner of ['whale', 'gpt', 'dragon'] as const) {
      await pet.evaluate(async owner => { await window.desktopPlay.selectPet(owner === 'whale' ? 'deepseek' : 'gpt'); if (owner !== 'whale') await window.desktopPlay.selectGptAppearance(owner === 'dragon' ? 'dragon' : 'classic'); }, owner);
      await send(owner, 'question', 'codex'); await pet.clock.runFor(200);
      await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'attention-codex'); await pet.clock.fastForward(120000);
      await expect(pet.locator('.pet-bubble')).toBeVisible();
      await pet.evaluate(() => (document.querySelector('.pet-character') as HTMLElement).click()); await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'attention-codex');
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id)).toBe(focused);
      await pet.locator('.bubble-message').dispatchEvent('click'); await expect(pet.locator('.pet-bubble')).toBeHidden();
    }
    await send('active', 'completion', 'codex'); await pet.clock.runFor(200);
    await send('queued', 'completion', 'chatgpt-work'); await send('urgent', 'approval', 'deepseek-harness'); await pet.clock.runFor(200);
    await pet.evaluate(() => window.desktopPlay.selectGptAppearance('classic')); await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'completion-codex');
    await pet.locator('.bubble-message').dispatchEvent('click'); await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'attention-deepseek-harness');
    await pet.locator('.bubble-close').dispatchEvent('click'); await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'completion-chatgpt-work');
    await pet.screenshot({ path: 'test-results/T013-persistent-bubble.png', omitBackground: true });
    await pet.evaluate(() => window.desktopPlay.hidePet());
    await send('hidden', 'question', 'codex');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'))!.showInactive()); await pet.clock.runFor(200);
    await expect(pet.locator('.pet-bubble')).toBeHidden();
  } finally { await app.close(); }
});

test('phrase controls preserve drafts, reject insufficient candidates and persist count/mode/selection through restart', async () => {
  const fixture = await launch(); let app = fixture.app;
  try {
    let pet = await app.firstWindow(); await pet.evaluate(() => window.desktopPlay.openSettings());
    let settings = app.windows().find(window => window !== pet) ?? await app.waitForEvent('window');
    await settings.locator('[data-category="pet"]').click(); await settings.locator('#tab-companionship').click();
    await settings.locator('#phrases').fill('First\nSecond\nThird\nFourth'); await settings.locator('#phrase-count').fill('2'); await settings.locator('#phrase-mode').selectOption('random');
    await settings.locator('[data-phrase-index="1"]').uncheck(); await settings.locator('[data-phrase-index="3"]').uncheck();
    await settings.locator('[data-persona="dragon"]').click(); await settings.locator('[data-persona="whale"]').click();
    await expect(settings.locator('#phrase-count')).toHaveValue('2'); await expect(settings.locator('#phrase-mode')).toHaveValue('random'); await expect(settings.locator('[data-phrase-index="1"]')).not.toBeChecked();
    await settings.locator('#phrase-count').fill('3'); await settings.locator('#save-settings').click(); await expect(settings.locator('#operation-status')).toContainText('候选短句数不能少于');
    await settings.locator('#phrase-count').fill('2'); await settings.locator('#phrase-mode').selectOption('sequential'); await settings.locator('#save-settings').click(); await expect(settings.locator('#save-hint')).toHaveText('设置已保存');
    await settings.screenshot({ path: 'test-results/T013-phrase-settings.png' });
    await app.close(); app = (await launch(fixture.profile)).app; pet = await app.firstWindow(); await expect(pet.locator('.pet-character')).toBeVisible();
    const saved = await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.phraseDisplayByPersona.whale); expect(saved).toEqual({ count: 2, mode: 'sequential', selectedIndices: [0, 2] });
    const click = () => pet.evaluate(() => (document.querySelector('.pet-character') as HTMLElement).click());
    await click(); await click(); await click(); await expect(pet.locator('.bubble-message')).toHaveText('First'); await click(); await expect(pet.locator('.bubble-message')).toHaveText('Third'); await click(); await expect(pet.locator('.bubble-page')).toHaveText('1/4');
    await pet.evaluate(async () => { const { settings } = await window.desktopPlay.getState(); settings.phraseDisplayByPersona.whale.count = 0; await window.desktopPlay.updateSettings({ phraseDisplayByPersona: settings.phraseDisplayByPersona }); });
    await expect(pet.locator('.bubble-page')).toHaveText('1/2');
  } finally { await app.close(); }
});
