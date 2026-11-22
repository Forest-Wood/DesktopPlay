import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { electronArgs } from './electron-args';
import { selectStudioPersona, settingsPage } from './settings-page';
import type { ConversationNotice } from '../../src/shared/types';

async function launch(profile?: string) {
  await mkdir('.tmp', { recursive: true }); profile ??= await mkdtemp(path.resolve('.tmp/smoke-mode-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  return { profile, app: await electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env }) };
}

test('global mode switches cleanly, persists across restart, controls whale period and suppresses extra notices in simple mode', async ({}, info) => {
  const fixture = await launch(); let app = fixture.app;
  try {
    let pet = await app.firstWindow(); await expect(pet.locator('.pet-character')).toBeVisible();
    const original = await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.bubbleProfilesByPersona);
    const clickPet = () => pet.locator('.pet-character').dispatchEvent('click');
    await pet.evaluate(() => { (window as any).played = 0; HTMLMediaElement.prototype.play = async function () { (window as any).played++; }; });
    await clickPet();
    await expect(pet.locator('.pet-period')).toBeVisible();
    await expect(pet.locator('.pet-period-status')).toContainText('API 时段');
    await pet.locator('.bubble-more').click();
    await pet.locator('.bubble-mode').click();
    await expect(pet.locator('.bubble-mode')).toHaveText('完整模式');
    await expect(pet.locator('.pet-period')).toBeHidden();
    await expect(pet.locator('.pet-spent-group')).toBeHidden();
    await pet.locator('.bubble-more').click();
    await expect(pet.locator('.bubble-switch')).toBeHidden();
    await expect(pet.locator('.bubble-appearance')).toBeHidden();
    await expect(pet.locator('.bubble-settings')).toBeVisible();
    await pet.locator('.bubble-menu-close').click();
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
    await expect(pet.locator('.bubble-source')).toHaveText('Codex');
    await pet.screenshot({ path: info.outputPath('codex-attention.png'), omitBackground: true });
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
    await pet.screenshot({ path: info.outputPath('gpt-simple.png'), omitBackground: true });
    expect(await pet.evaluate(() => (window as any).played)).toBe(0);
    expect(await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.bubbleProfilesByPersona)).toEqual(original);
    await app.close(); app = (await launch(fixture.profile)).app; pet = await app.firstWindow();
    expect(await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.petMode)).toBe('simple');
    await clickPet(); await pet.locator('.bubble-more').click(); await pet.locator('.bubble-mode').click();
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
    await expect(settings.locator('.sidebar nav [data-category]')).toHaveText(['首页总览', '伙伴', '账户', '提醒中心', '人设工作室', '系统']);
    await expect(settings.locator('#home')).toBeVisible();
    await settings.locator('#home [data-settings-page="overview"]').click();
    await expect(settings.locator('#tab-overview')).toBeFocused();
    await settings.locator('#tab-overview').press('ArrowRight');
    await expect(settings.locator('#tab-codex')).toBeFocused();
    await expect(settings.locator('#codex')).toBeVisible();
    await settings.locator('#tab-codex').press('End');
    await expect(settings.locator('#tab-records')).toBeFocused();
    await settings.locator('#tab-records').press('Home');
    await expect(settings.locator('.page-tabs [role="tab"]')).toHaveText(['DeepSeek', 'Codex', 'Gemini', '消费记录']);
    await expect(settings.locator('#deepseek-period')).toContainText(/当前/);
    await expect(settings.locator('#deepseek-period-rule')).toContainText('已换算为电脑时间');
    await settings.screenshot({ path: 'test-results/T019-deepseek-time.png' });
    await settings.locator('#companion-shortcut').click();
    await expect(settings.locator('[data-category="pet"]')).toHaveAttribute('aria-current', 'page');
    await expect(settings.locator('#tab-appearance')).toBeFocused();
    await expect(settings.locator('.page-tabs [role="tab"]')).toHaveText(['角色与模式', '桌面行为']);
    await expect(settings.locator('#companion-mode')).toContainText('完整模式');
    await expect(settings.locator('.save-bar')).toHaveAttribute('data-dirty', 'false');
    await settings.locator('#pet-mode').selectOption('simple');
    await expect(settings.locator('.save-bar')).toHaveAttribute('data-dirty', 'true');
    await expect(settings.locator('#save-hint')).toHaveText('1 项未保存');
    await expect(settings.locator('[data-category="pet"]')).toHaveAttribute('data-dirty', '');
    await expect(settings.locator('#tab-appearance')).toHaveAttribute('data-dirty', '');
    await settings.locator('#select-gpt').click();
    await expect(settings.locator('#select-gpt')).toHaveAttribute('aria-pressed', 'true');
    await expect(settings.locator('#save-hint')).toHaveText('1 项未保存');
    await settingsPage(settings, 'completion');
    await expect(settings.locator('.page-tabs [role="tab"]')).toHaveText(['对话提醒', '余额提醒']);
    await expect(settings.locator('.integration-card')).toHaveCount(4);
    for (const source of ['codex', 'chatgpt-work', 'deepseek-harness', 'antigravity']) {
      const card = settings.locator(`.integration-card[data-source="${source}"]`);
      await expect(card.locator('.reminder-channel input')).toHaveCount(2);
      await expect(card.locator('.reminder-health')).toBeVisible();
      await expect(card.locator('[data-reminder-guide]')).toHaveAttribute('aria-expanded', 'false');
    }
    await expect(settings.locator('input[name="codexHookEnabled"]')).toBeHidden();
    await expect(settings.locator('#codex-attention-status')).toBeHidden();
    await expect(settings.locator('#companion-mode')).toContainText('完整模式');
    expect(await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.petMode)).toBe('full');
    await settingsPage(settings, 'reminders');
    await settings.locator('#daily-budget').fill('12');
    await expect(settings.locator('#save-hint')).toHaveText('2 项未保存');
    await expect(settings.locator('[data-category="reminders"]')).toHaveAttribute('data-dirty', '');
    const latestBudget = await settings.evaluate(async () => (await window.desktopPlay.updateSettings({ dailyBudget: '3' })).settings.dailyBudget);
    await expect(settings.locator('#daily-budget')).toHaveValue('12');
    await settings.locator('#discard-settings').click();
    await expect(settings.locator('#daily-budget')).toHaveValue(latestBudget!);
    await expect(settings.locator('.sidebar [data-dirty]')).toHaveCount(0);
    await expect(settings.locator('#save-hint')).toHaveText('设置已同步');
    await settings.locator('#companion-shortcut').click();
    await expect(settings.locator('#pet-mode')).toHaveValue('full');
    await settings.locator('#pet-mode').selectOption('simple');
    await expect(settings.locator('.save-bar')).toHaveAttribute('data-dirty', 'true');
    await settings.locator('#save-settings').click();
    await expect(settings.locator('#save-hint')).toHaveText('设置已保存');
    await expect(settings.locator('.save-bar')).toHaveAttribute('data-dirty', 'false');
    await expect(settings.locator('#companion-mode')).toContainText('简洁模式');
    expect(await pet.evaluate(async () => (await window.desktopPlay.getState()).settings.petMode)).toBe('simple');
    await settings.screenshot({ path: 'test-results/T019-mode-settings.png' });
    await settingsPage(settings, 'sound');
    await selectStudioPersona(settings, 'dragon');
    await settings.locator('[data-edit-sound="codex"]').click();
    await expect(settings.locator('[data-category="studio"]')).toHaveAttribute('aria-current', 'page');
    await expect(settings.locator('#bubble-scenario')).toHaveValue('completion-codex');
    await expect(settings.locator('[data-studio-gpt="dragon"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(settings.locator('#bubble-sound-enabled')).toBeFocused();
    await expect(settings.locator('.save-bar')).toHaveAttribute('data-dirty', 'false');
    await settings.locator('#bubbles [data-settings-page="completion"]').click();
    await settings.locator('[data-edit-completion="chatgpt-work"]').click();
    await expect(settings.locator('#bubble-scenario')).toHaveValue('completion-chatgpt-work');
    await expect(settings.locator('#bubble-sound-enabled')).toBeFocused();
    await settingsPage(settings, 'records');
    await expect(settings.locator('#records-zone')).toContainText('电脑时区');
    await expect(settings.locator('#records-period')).toContainText('当前');
    await settings.screenshot({ path: 'test-results/T019-records.png' });
    await settingsPage(settings, 'overview');
    for (const [width, height] of [[1060, 800], [760, 560]]) {
      await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('view=settings'))!.setContentSize(w, h), [width, height]);
      await expect.poll(() => settings.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
      await settings.screenshot({ path: `test-results/T035-settings-${width}x${height}.png` });
      expect(await settings.evaluate(() => {
        const content = document.querySelector<HTMLElement>('.settings-content')!;
        const sidebar = document.querySelector<HTMLElement>('.sidebar')!;
        return {
          windowFits: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
          contentFits: content.scrollWidth <= content.clientWidth,
          sidebarFits: sidebar.scrollHeight <= sidebar.clientHeight,
        };
      })).toEqual({ windowFits: true, contentFits: true, sidebarFits: true });
      await expect(settings.locator('#save-settings')).toBeInViewport();
    }
    await settings.locator('#api-key').scrollIntoViewIfNeeded();
    await expect(settings.locator('#save-settings')).toBeInViewport();
  } finally { await app.close(); }
});
