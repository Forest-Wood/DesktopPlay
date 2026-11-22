import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { electronArgs } from './electron-args';
import { settingsPage } from './settings-page';

test('reminder matrix expands guides, saves drafts and opens the active persona sound', async () => {
  const temp = path.resolve('.tmp/T037-smoke');
  await mkdir(temp, { recursive: true });
  const profile = await mkdtemp(path.join(temp, 'profile-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    DESKTOPPLAY_USER_DATA: profile,
    DESKTOPPLAY_TEST_NO_CODEX: '1',
    DESKTOPPLAY_TEST_NO_ONBOARDING: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env });
  try {
    const pet = await app.firstWindow();
    await pet.evaluate(async () => {
      await window.desktopPlay.selectPet('gpt');
      await window.desktopPlay.selectGptAppearance('dragon');
      const { settings } = await window.desktopPlay.getState();
      const profiles = settings.bubbleProfilesByPersona;
      profiles.dragon.rules['completion-chatgpt-work'].volume = .65;
      await window.desktopPlay.updateSettings({ bubbleProfilesByPersona: profiles });
      await window.desktopPlay.openSettings();
    });
    const settings = app.windows().find(window => window !== pet) ?? await app.waitForEvent('window');
    await settings.locator('#category-reminders').press('Enter');
    await expect(settings.getByRole('table', { name: '对话提醒' }).getByRole('rowgroup')).toHaveCount(4);
    const size = async (width: number, height: number) => {
      await app.evaluate(({ BrowserWindow }, [w, h]) =>
        BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=settings'))!.setContentSize(w, h), [width, height]);
      await expect.poll(() => settings.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
      expect(await settings.locator('.settings-content').evaluate(container => container.scrollWidth <= container.clientWidth)).toBe(true);
      await expect(settings.locator('#save-settings')).toBeInViewport();
    };
    await size(1060, 800);
    await expect(settings.locator('#completion .reminder-balance')).toBeVisible();
    await expect(settings.locator('#completion [data-reminder-guide][aria-expanded="true"]')).toHaveCount(0);
    await settings.screenshot({ path: 'test-results/T037-reminders-1060x800.png', scale: 'css' });

    const gemini = settings.locator('.integration-card[data-source=antigravity]');
    await size(760, 560);
    await gemini.locator('.reminder-source').click();
    await expect(gemini.locator('[data-reminder-guide]')).toBeFocused();
    await expect(gemini.locator('[data-reminder-guide]')).toHaveAttribute('aria-expanded', 'true');
    await expect(settings.locator('#reminder-guide-antigravity')).toBeVisible();
    expect(await settings.locator('.settings-content').evaluate(container => container.scrollWidth <= container.clientWidth)).toBe(true);
    await settings.screenshot({ path: 'test-results/T037-guide-760x560.png', scale: 'css' });
    await gemini.locator('[data-reminder-guide]').press('Space');
    await expect(settings.locator('#reminder-guide-antigravity')).toBeHidden();
    await size(1060, 800);

    await settings.locator('#completion-enabled').uncheck();
    await settings.locator('input[name="attention-codex"]').uncheck();
    await settings.locator('#completion #daily-budget').fill('7');
    const original = await pet.evaluate(async () => (await window.desktopPlay.getState()).settings);
    expect(original.codexCompletionEnabled).toBe(true);
    expect(original.attentionEnabledBySource.codex).toBe(true);
    expect(original.dailyBudget).toBeNull();
    await settingsPage(settings, 'reminders');
    await expect(settings.locator('#daily-budget')).toHaveCount(1);
    await expect(settings.locator('#reminders #daily-budget')).toHaveValue('7');
    await settings.locator('#save-settings').click();
    await expect(settings.locator('#save-hint')).toHaveText('设置已保存');
    const saved = await pet.evaluate(async () => (await window.desktopPlay.getState()).settings);
    expect(saved.codexCompletionEnabled).toBe(false);
    expect(saved.attentionEnabledBySource.codex).toBe(false);
    expect(Number(saved.dailyBudget)).toBe(7);
    await settingsPage(settings, 'completion');
    await expect(settings.locator('.integration-card[data-source=codex] .reminder-health')).toHaveText('已关闭');

    await settings.evaluate(() => {
      HTMLMediaElement.prototype.play = function () {
        document.body.dataset.reminderPreviewVolume = String(this.volume);
        return Promise.resolve();
      };
    });
    const chatgpt = settings.locator('.integration-card[data-source=chatgpt-work]');
    await chatgpt.getByRole('button', { name: '试听 ChatGPT App 完成音效' }).click();
    await expect(settings.locator('body')).toHaveAttribute('data-reminder-preview-volume', '0.65');
    await chatgpt.getByRole('button', { name: '编辑 ChatGPT App 完成音效' }).click();
    await expect(settings.locator('#bubble-scenario')).toHaveValue('completion-chatgpt-work');
    await expect(settings.locator('[data-bubble-persona=dragon]')).toHaveAttribute('aria-pressed', 'true');
    await expect(settings.locator('#bubble-sound-enabled')).toBeFocused();
    await expect(settings.locator('#bubble-sound-volume')).toHaveValue('0.65');
  } finally { await app.close(); }
});
