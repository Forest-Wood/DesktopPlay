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

test('global mode switches cleanly, persists across restart, controls whale period and suppresses extra notices in simple mode', async () => {
  const fixture = await launch(); let app = fixture.app;
  try {
    let pet = await app.firstWindow(); await expect(pet.locator('.pet-character')).toBeVisible();
    const original = await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.bubbleProfilesByPersona);
    const clickPet = () => pet.locator('.pet-character').dispatchEvent('click');
    await pet.evaluate(() => { (window as any).played = 0; HTMLMediaElement.prototype.play = async function () { (window as any).played++; }; });
    await clickPet();
    await expect(pet.locator('.pet-period')).toBeVisible();
    await expect(pet.locator('.pet-period-status')).toContainText('API 时段');
    await pet.locator('.bubble-mode').dispatchEvent('click');
    await expect(pet.locator('.bubble-mode')).toHaveText('完整模式');
    await expect(pet.locator('.pet-period')).toBeHidden();
    await expect(pet.locator('.pet-spent-group')).toBeHidden();
    await expect(pet.locator('.bubble-switch')).toBeHidden();
    await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))!;
      const state = await w.webContents.executeJavaScript('window.desktopPlay.getState()');
      w.webContents.send('desktopplay:state', { ...state, alert: { id: 'mode-test-alert', kind: 'daily-budget', message: '预算提醒测试' } });
      w.webContents.send('desktopplay:update-available', { version: '8.8.8' });
    });
    await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'usage');
    // Conversation notices remain visible in simple mode.
    await app.evaluate(({ BrowserWindow }, notice) => {
      BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))!.webContents.send('desktopplay:conversation-notice', notice);
    }, { id: 'simple-question', kind: 'question', source: 'codex', occurredAt: new Date().toISOString() } as ConversationNotice);
    await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'attention-codex');
    await pet.locator('.bubble-close').dispatchEvent('click');
    // Simple mode renders only remaining quota for GPT and suppresses click audio.
    await pet.evaluate(async () => { (window as any).played = 0; await window.desktopPlay.updateSettings({ soundEnabled: true, volume: 1 }); await window.desktopPlay.selectPet('gpt'); });
    await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))!;
      const state = await w.webContents.executeJavaScript('window.desktopPlay.getState()');
      const window = { usedPercent: 20, remainingPercent: 80, windowMinutes: 10080, resetsAt: new Date(Date.now() + 86400000).toISOString() };
      w.webContents.send('desktopplay:state', { ...state, codex: { ...state.codex, status: 'ready', planType: 'plus', updatedAt: new Date().toISOString(), buckets: [{ id: 'codex', name: 'Codex', primary: window, secondary: { ...window, windowMinutes: 300 }, creditsRemaining: null, unlimitedCredits: false }] } });
    });
    await clickPet();
    await expect(pet.locator('.quota-percentage')).toHaveText(['80%', '80%']);
    await expect(pet.locator('.quota-countdown')).toHaveCount(0);
    await expect(pet.locator('.quota-plan-badge')).toHaveCount(0);
    expect(await pet.evaluate(() => (window as any).played)).toBe(0);
    expect(await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.bubbleProfilesByPersona)).toEqual(original);
    await app.close(); app = (await launch(fixture.profile)).app; pet = await app.firstWindow();
    expect(await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.petMode)).toBe('simple');
    await clickPet(); await pet.locator('.bubble-mode').dispatchEvent('click');
    await expect(pet.locator('.bubble-mode')).toHaveText('简洁模式');
    await clickPet(); await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'summary');
  } finally { await app.close(); }
});

test('settings exposes the saved global mode and local peak information', async () => {
  const { app } = await launch();
  try {
    const pet = await app.firstWindow(); await expect(pet.locator('.pet-character')).toBeVisible();
    await pet.evaluate(() => window.desktopPlay.openSettings());
    const settings = app.windows().find(w => w !== pet) ?? await app.waitForEvent('window');
    await expect(settings.locator('.sidebar nav [data-category]')).toHaveCount(5);
    expect(await settings.locator('.sidebar nav [data-category]').evaluateAll(buttons => buttons.map(button => (button as HTMLElement).dataset.category))).toEqual(['pet', 'account', 'reminders', 'bubbles', 'about']);
    await expect(settings.locator('.page-tabs [role="tab"]')).toHaveText(['DeepSeek', 'Codex', 'Gemini', '消费记录']);
    await expect(settings.locator('#deepseek-period')).toContainText(/当前/);
    await expect(settings.locator('#deepseek-period-rule')).toContainText('已换算为电脑时间');
    await settings.screenshot({ path: 'test-results/T019-deepseek-time.png' });
    await settings.locator('#companion-shortcut').click();
    await expect(settings.locator('[data-category="pet"]')).toHaveAttribute('aria-current', 'page');
    await expect(settings.locator('#tab-appearance')).toBeFocused();
    await expect(settings.locator('.page-tabs [role="tab"]')).toHaveText(['角色与模式', '桌面行为', '陪伴短句']);
    await expect(settings.locator('#companion-mode')).toContainText('完整模式');
    await expect(settings.locator('.save-bar')).toHaveAttribute('data-dirty', 'false');
    await settings.locator('#pet-mode').selectOption('simple');
    await expect(settings.locator('.save-bar')).toHaveAttribute('data-dirty', 'true');
    await expect(settings.locator('#save-hint')).toHaveText('有尚未保存的调整');
    await settings.locator('[data-category="reminders"]').click();
    await expect(settings.locator('.page-tabs [role="tab"]')).toHaveText(['对话提醒', '余额提醒', '声音']);
    await expect(settings.locator('.integration-card')).toHaveCount(4);
    for (const source of ['codex', 'chatgpt-work', 'deepseek-harness', 'antigravity']) {
      const card = settings.locator(`.integration-card[data-source="${source}"]`);
      await expect(card.locator('.integration-toggles input')).toHaveCount(2);
      await expect(card.locator('.integration-toggles')).toBeVisible();
      await expect(card.locator('.integration-details')).toHaveJSProperty('open', false);
    }
    await expect(settings.locator('input[name="codexHookEnabled"]')).toBeHidden();
    await expect(settings.locator('#codex-attention-status')).toBeVisible();
    await expect(settings.locator('#companion-mode')).toContainText('完整模式');
    expect(await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.petMode)).toBe('full');
    await settings.locator('#companion-shortcut').click();
    await expect(settings.locator('#pet-mode')).toHaveValue('simple');
    await expect(settings.locator('.save-bar')).toHaveAttribute('data-dirty', 'true');
    await settings.locator('#save-settings').click();
    await expect(settings.locator('#save-hint')).toHaveText('设置已保存');
    await expect(settings.locator('.save-bar')).toHaveAttribute('data-dirty', 'false');
    await expect(settings.locator('#companion-mode')).toContainText('简洁模式');
    expect(await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.petMode)).toBe('simple');
    await settings.screenshot({ path: 'test-results/T019-mode-settings.png' });
    await settings.locator('[data-category="reminders"]').click(); await settings.locator('#tab-sound').click();
    await settings.locator('[data-sound-persona="dragon"]').click();
    await settings.locator('[data-edit-sound="codex"]').click();
    await expect(settings.locator('[data-category="bubbles"]')).toHaveAttribute('aria-current', 'page');
    await expect(settings.locator('#bubble-scenario')).toHaveValue('completion-codex');
    await expect(settings.locator('[data-bubble-persona="dragon"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(settings.locator('#bubble-sound-enabled')).toBeFocused();
    await expect(settings.locator('.save-bar')).toHaveAttribute('data-dirty', 'false');
    await settings.locator('[data-settings-page="completion"]').click();
    await settings.locator('[data-edit-completion="chatgpt-work"]').click();
    await expect(settings.locator('#bubble-scenario')).toHaveValue('completion-chatgpt-work');
    await expect(settings.locator('#bubble-scenario')).toBeFocused();
    await settings.locator('[data-category="account"]').click(); await settings.locator('#tab-records').click();
    await expect(settings.locator('#records-zone')).toContainText('电脑时区');
    await expect(settings.locator('#records-period')).toContainText('当前');
    await settings.screenshot({ path: 'test-results/T019-records.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=settings'))!.setContentSize(760, 560));
    await settings.locator('[data-category="account"]').click(); await settings.locator('#tab-overview').click();
    expect(await settings.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await settings.locator('#api-key').scrollIntoViewIfNeeded();
    await expect(settings.locator('#api-key')).toBeVisible();
  } finally { await app.close(); }
});
