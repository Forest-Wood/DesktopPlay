import { expect, test, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { electronArgs } from './electron-args';
import { settingsPage } from './settings-page';

test('home opens by default, guides setup, and refreshes all three accounts in order', async ({}, info) => {
  const profile = info.outputPath('profile');
  await mkdir(profile, { recursive: true });
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
    await pet.evaluate(() => window.desktopPlay.openSettings());
    const settings = app.windows().find(window => window !== pet) ?? await app.waitForEvent('window');
    await expect(settings.locator('#home')).toBeVisible();
    await expect(settings.locator('#home .home-account')).toHaveCount(3);
    await expect(settings.locator('#home .home-reminder')).toHaveCount(4);
    await expect(settings.locator('[data-account=deepseek]')).toHaveAttribute('data-active', 'true');
    await expect(settings.locator('#home-account-summary')).toHaveText('0 个账户正常');
    await expect(settings.locator('#home-pet-name')).toContainText('小鲸鱼');

    const size = async (width: number, height: number) => {
      await app.evaluate(({ BrowserWindow }, [w, h]) =>
        BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=settings'))!.setContentSize(w, h), [width, height]);
      await expect.poll(() => settings.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
    };
    await size(760, 560);
    expect(await settings.evaluate(() => {
      const content = document.querySelector<HTMLElement>('.settings-content')!;
      const cards = Array.from(content.querySelectorAll('.home-account'));
      const rows = new Set(cards.map(card => card.getBoundingClientRect().top));
      return rows.size === 3 && content.scrollWidth <= content.clientWidth && document.documentElement.scrollWidth <= innerWidth;
    })).toBe(true);
    await expect(settings.locator('#save-settings')).toBeInViewport();
    await settings.screenshot({ path: info.outputPath('home-760x560-empty.png'), scale: 'css' });
    await size(1060, 800);

    const refreshCalls = async () => app.evaluate(() => (globalThis as { t036RefreshCalls?: string[] }).t036RefreshCalls ?? []);
    await app.evaluate(({ dialog, ipcMain }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (event: unknown) => unknown> })._invokeHandlers;
      const calls: string[] = [];
      (globalThis as { t036RefreshCalls?: string[] }).t036RefreshCalls = calls;
      for (const name of ['refresh', 'refresh-codex', 'refresh-gemini']) {
        const channel = `desktopplay:${name}`;
        const original = handlers.get(channel)!;
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, event => {
          calls.push(name);
          if (name === 'refresh') throw new Error('synthetic balance refresh failure');
          return original(event);
        });
      }
    });
    await settings.getByRole('button', { name: '添加 API Key' }).click();
    await expect(settings.locator('#api-key')).toBeFocused();
    await settingsPage(settings, 'home');
    await settings.locator('#home').getByRole('button', { name: '选择 codex.exe' }).click();
    await expect(settings.locator('#codex')).toBeVisible();
    await settingsPage(settings, 'home');
    await settings.getByRole('button', { name: '打开 Antigravity 或登录 agy' }).click();
    await expect(settings.locator('#home-gemini-guide')).toBeVisible();
    expect(await refreshCalls()).toEqual([]);

    const geminiProfile = path.join(profile, 'gemini-test-home');
    await mkdir(geminiProfile, { recursive: true });
    await writeFile(path.join(geminiProfile, 'quota.json'), JSON.stringify({ planName: 'AI Pro', groups: [{ buckets: [
      { id: 'gemini-argon-wtu-weekly', disabled: true, sharedWith: 'gemini-weekly' },
      { id: 'gemini-weekly', remainingFraction: 0 },
    ] }] }));
    await settings.getByRole('button', { name: '刷新全部' }).click();
    await expect(settings.locator('#operation-status')).toContainText('DeepSeek');
    expect(await refreshCalls()).toEqual(['refresh', 'refresh-codex', 'refresh-gemini']);
    const gemini = settings.locator('#home [data-account=gemini]');
    await expect(gemini.locator('.home-plan')).toHaveText('AI Pro');
    await expect(gemini.locator('.gemini-quota-row span')).toHaveText(['Gemini 周额度', 'Gemini 5 小时额度']);
    await expect(gemini.locator('.gemini-quota-row strong')).toHaveText(['0%', '未提供']);
    await expect(gemini.locator('progress')).toHaveCount(1);
    await settings.screenshot({ path: info.outputPath('home-1060x800-desktop.png'), scale: 'css' });

    await settings.locator('#home .home-reminder[data-source=chatgpt-work]').click();
    await expect(settings.locator('#reminder-guide-chatgpt-work')).toBeVisible();
    await expect(settings.locator('#completion .integration-card[data-source=chatgpt-work] [data-reminder-guide]')).toBeFocused();
    await settingsPage(settings, 'home');
    await settings.getByRole('button', { name: '切换为简洁模式' }).click();
    await expect(settings.locator('#home-pet-mode')).toHaveText('简洁模式');
    await expect(settings.locator('#save-hint')).toHaveText('设置已同步');
    await settings.getByRole('button', { name: '换角色' }).click();
    await settings.locator('#home-pet-choices').getByRole('button', { name: 'GPT' }).click();
    await expect(settings.locator('[data-account=gpt]')).toHaveAttribute('data-active', 'true');
    await settings.getByRole('button', { name: '换造型' }).click();
    await expect(settings.locator('#home-pet-name')).toContainText('白龙');
    await settings.locator('#home').getByRole('button', { name: '检查更新' }).click();
    await expect(settings.locator('#version')).toBeVisible();
  } finally { await app.close(); }
});
