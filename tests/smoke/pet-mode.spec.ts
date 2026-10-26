import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { electronArgs } from './electron-args';
import type { ConversationNotice } from '../../src/shared/types';

async function launch(profile?: string) {
  await mkdir('.tmp', { recursive: true }); profile ??= await mkdtemp(path.resolve('.tmp/smoke-mode-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  return { profile, app: await electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env }) };
}

test('global mode preserves conversation notices and profiles, suppresses other pages, and survives restart', async () => {
  const fixture = await launch(); let app = fixture.app;
  try {
    let pet = await app.firstWindow(); await expect(pet.locator('.pet-character')).toBeVisible();
    const original = await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.bubbleProfilesByPersona);
    const clickPet = () => pet.locator('.pet-character').dispatchEvent('click');
    await clickPet(); await pet.locator('.bubble-mode').dispatchEvent('click');
    await expect(pet.locator('.bubble-mode')).toHaveText('完整模式');
    for (const owner of ['whale', 'gpt', 'dragon', 'custom'] as const) {
      // Custom appearance uses the GPT profile; inject its asset identity without a file dialog.
      await pet.evaluate(async owner => {
        await window.desktopPlay.selectPet(owner === 'whale' ? 'deepseek' : 'gpt');
        if (owner !== 'whale' && owner !== 'custom') await window.desktopPlay.selectGptAppearance(owner === 'dragon' ? 'dragon' : 'classic');
      }, owner);
      if (owner === 'custom') await app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))!;
        await window.webContents.executeJavaScript('window.desktopPlay.getState()').then(state => window.webContents.send('desktopplay:state', { ...state, gptAppearance: 'custom', pet: { ...state.pet, isCustom: true } }));
      });
      await clickPet(); await clickPet();
      await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'usage');
      await expect(pet.locator('.pet-spent-group')).toBeHidden();
      await expect(pet.locator('.bubble-switch')).toBeHidden(); await expect(pet.locator('.bubble-appearance')).toBeHidden();
      await expect(pet.locator('.quota-reset-credits')).toHaveCount(0);
      for (const kind of ['completion', 'question', 'approval'] as const) {
        await app.evaluate(({ BrowserWindow }, notice) => {
          BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))!.webContents.send('desktopplay:conversation-notice', notice);
        }, { id: `${owner}-${kind}`, kind, source: 'codex', occurredAt: new Date().toISOString() } as ConversationNotice);
        await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', kind === 'completion' ? 'completion-codex' : 'attention-codex');
        await pet.locator('.bubble-mode').dispatchEvent('click');
        await expect(pet.locator('.bubble-mode')).toHaveText('简洁模式');
        await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', kind === 'completion' ? 'completion-codex' : 'attention-codex');
        await pet.locator('.bubble-mode').dispatchEvent('click');
        await expect(pet.locator('.bubble-mode')).toHaveText('完整模式');
        await pet.locator('.bubble-close').dispatchEvent('click');
      }
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))!.webContents.send('desktopplay:update-available', { version: '9.9.9' }));
    await expect(pet.locator('.pet-bubble')).toBeHidden();
    expect(await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.bubbleProfilesByPersona)).toEqual(original);
    await pet.evaluate(() => window.desktopPlay.selectPet('deepseek')); await clickPet();
    await pet.screenshot({ path: 'test-results/T019-simple-pet.png', omitBackground: true });
    await app.close(); app = (await launch(fixture.profile)).app; pet = await app.firstWindow();
    expect(await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.petMode)).toBe('simple');
    await clickPet(); await pet.locator('.bubble-mode').dispatchEvent('click');
    await expect(pet.locator('.bubble-mode')).toHaveText('简洁模式');
    await clickPet(); await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'summary');
    await pet.screenshot({ path: 'test-results/T019-full-pet.png', omitBackground: true });
  } finally { await app.close(); }
});

test('settings exposes the saved global mode and local peak information', async () => {
  const { app } = await launch();
  try {
    const pet = await app.firstWindow(); await expect(pet.locator('.pet-character')).toBeVisible();
    await pet.evaluate(() => window.desktopPlay.openSettings());
    const settings = app.windows().find(w => w !== pet) ?? await app.waitForEvent('window');
    await expect(settings.locator('#deepseek-period')).toContainText(/当前/);
    await expect(settings.locator('#deepseek-period-rule')).toContainText('已换算为电脑时间');
    await settings.screenshot({ path: 'test-results/T019-deepseek-time.png' });
    await settings.locator('[data-category="pet"]').click();
    await settings.locator('#pet-mode').selectOption('simple'); await settings.locator('#save-settings').click();
    await expect(settings.locator('#save-hint')).toHaveText('设置已保存');
    expect(await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.petMode)).toBe('simple');
    await settings.screenshot({ path: 'test-results/T019-mode-settings.png' });
    await settings.locator('[data-category="reminders"]').click(); await settings.locator('#tab-records').click();
    await expect(settings.locator('#records-zone')).toContainText('电脑时区');
    await expect(settings.locator('#records-period')).toContainText('当前');
    await settings.screenshot({ path: 'test-results/T019-records.png' });
  } finally { await app.close(); }
});

test('simple mode discards budget/update notices, suppresses click audio and renders only remaining quota', async () => {
  const { app } = await launch();
  try {
    const pet = await app.firstWindow(); await expect(pet.locator('.pet-character')).toBeVisible();
    await pet.evaluate(async () => {
      await window.desktopPlay.updateSettings({ petMode: 'simple', soundEnabled: true, volume: 1 });
      (window as any).played = 0;
      HTMLMediaElement.prototype.play = async function () { (window as any).played++; };
    });
    await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))!;
      const state = await w.webContents.executeJavaScript('window.desktopPlay.getState()');
      w.webContents.send('desktopplay:state', { ...state, alert: { id: 'mode-test-alert', kind: 'daily-budget', message: '预算提醒测试' } });
      w.webContents.send('desktopplay:update-available', { version: '8.8.8' });
    });
    await pet.locator('.pet-character').dispatchEvent('click');
    await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'usage');
    expect(await pet.evaluate(() => (window as any).played)).toBe(0);
    await pet.locator('.bubble-mode').dispatchEvent('click');
    await expect(pet.locator('.bubble-mode')).toHaveText('简洁模式');
    await pet.locator('.bubble-close').dispatchEvent('click');
    await pet.clock.install(); await pet.clock.runFor(1000);
    await expect(pet.locator('.pet-bubble')).toBeHidden();
    await pet.evaluate(async () => { await window.desktopPlay.updateSettings({ petMode: 'simple' }); await window.desktopPlay.selectPet('gpt'); });
    await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))!;
      const state = await w.webContents.executeJavaScript('window.desktopPlay.getState()');
      const window = { usedPercent: 20, remainingPercent: 80, windowMinutes: 10080, resetsAt: new Date(Date.now() + 86400000).toISOString() };
      w.webContents.send('desktopplay:state', { ...state, codex: { ...state.codex, status: 'ready', planType: 'plus', updatedAt: new Date().toISOString(), buckets: [{ id: 'codex', name: 'Codex', primary: window, secondary: { ...window, windowMinutes: 300 }, creditsRemaining: null, unlimitedCredits: false }] } });
    });
    await pet.locator('.pet-character').dispatchEvent('click');
    await expect(pet.locator('.quota-percentage')).toHaveText(['80%', '80%']);
    await expect(pet.locator('.quota-countdown')).toHaveCount(0); await expect(pet.locator('.quota-plan-badge')).toHaveCount(0);
    await pet.screenshot({ path: 'test-results/T019-simple-quota.png', omitBackground: true });
  } finally { await app.close(); }
});
