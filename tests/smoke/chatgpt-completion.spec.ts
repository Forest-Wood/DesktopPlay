import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import path from 'node:path';
import { appendFile, mkdir, mkdtemp, rename, writeFile } from 'node:fs/promises';
import { electronArgs } from './electron-args';
import { chatgptTurnEnd } from '../fixtures/chatgpt-notification';

test('ChatGPT Work native ends use role text without focus/role changes, deduplicate, skip hidden/disabled/startup history', async () => {
  test.setTimeout(90000);
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/smoke-chatgpt-completion-'));
  const logs = path.join(profile, 'fake-chatgpt-logs'), dated = path.join(logs, '2026', '10', '20');
  await mkdir(dated, { recursive: true });
  const file = path.join(dated, 'desktop-t0.log');
  await writeFile(file, chatgptTurnEnd('history'));
  await writeFile(path.join(dated, 'newer-empty-t1.log'), '');
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1', DESKTOPPLAY_TEST_CHATGPT_LOG_DIR: logs };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env });
  let application = await launch();
  try {
    const pet = await application.firstWindow();
    await expect.poll(() => pet.evaluate(async () => (await window.desktopPlay.getState()).chatgptCompletion.status)).toBe('watching');
    await expect(pet.locator('.pet-bubble')).toBeHidden();
    const custom = { whale: '小鲸鱼等到 Work 结束啦', gpt: '<b>Work 本轮已经结束</b>', dragon: '白龙已收到 Work 的结束通知。' };
    await pet.evaluate(async messages => {
      window.desktopPlay.onCodexCompletion(event => { document.body.dataset.workCount = String(Number(document.body.dataset.workCount ?? 0) + 1); document.body.dataset.lastWorkEvent = JSON.stringify(event); });
      await window.desktopPlay.updateSettings({ completionMessagesByPersona: messages, bubbleDurationSeconds: 1, bubbleHoverDelaySeconds: 0 });
      await window.desktopPlay.openSettings();
    }, custom);
    const settings = application.windows().find(win => win !== pet) ?? await application.waitForEvent('window');
    await settings.locator('[data-category="reminders"]').click(); await settings.locator('#tab-completion').click();
    await expect(settings.locator('#chatgpt-completion-status')).toHaveText('正在监听 ChatGPT 桌面结束通知');
    await expect(settings.locator('#completion-status')).toContainText('等待 Codex 会话');
    await settings.screenshot({ path: 'test-results/chatgpt-completion-settings.png' });
    for (const [index, persona] of (['whale', 'gpt', 'dragon'] as const).entries()) {
      await pet.evaluate(async persona => { await window.desktopPlay.selectPet(persona === 'whale' ? 'deepseek' : 'gpt'); if (persona !== 'whale') await window.desktopPlay.selectGptAppearance(persona === 'dragon' ? 'dragon' : 'classic'); }, persona);
      await settings.bringToFront();
      const focused = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id);
      const turn = ['success', 'failure-no-status', 'interrupted-no-status'][index];
      await appendFile(file, chatgptTurnEnd(turn));
      await expect(pet.locator('.bubble-label')).toHaveText('ChatGPT Work 结束提醒');
      await expect(pet.locator('.bubble-message')).toHaveText(custom[persona]);
      await expect(pet.locator('.bubble-message b')).toHaveCount(0);
      expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id)).toBe(focused);
      expect((await pet.evaluate(() => window.desktopPlay.getState())).activePet).toBe(persona === 'whale' ? 'deepseek' : 'gpt');
      const event = JSON.parse((await pet.locator('body').getAttribute('data-last-work-event'))!);
      expect(Object.keys(event).sort()).toEqual(['completedAt', 'id', 'source']); expect(event.source).toBe('chatgpt-work');
      expect(JSON.stringify(event)).not.toContain('fake-account'); expect(JSON.stringify(event)).not.toContain('fake-user');
      expect(await pet.locator('.bubble-top').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      if (persona === 'dragon') await pet.screenshot({ path: 'test-results/chatgpt-completion-dragon.png', omitBackground: true });
      await expect(pet.locator('.pet-bubble')).toBeHidden();
    }
    await expect(pet.locator('body')).toHaveAttribute('data-work-count', '3');
    await rename(file, path.join(dated, 'rotated.log'));
    await writeFile(file, chatgptTurnEnd('interrupted-no-status'));
    await new Promise(resolve => setTimeout(resolve, 2200));
    await expect(pet.locator('body')).toHaveAttribute('data-work-count', '3');
    await pet.evaluate(() => window.desktopPlay.hidePet());
    await appendFile(file, chatgptTurnEnd('hidden'));
    await new Promise(resolve => setTimeout(resolve, 10));
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('view=pet'))!.showInactive());
    await new Promise(resolve => setTimeout(resolve, 2200));
    await expect(pet.locator('.pet-bubble')).toBeHidden(); await expect(pet.locator('body')).toHaveAttribute('data-work-count', '3');
    await pet.evaluate(() => window.desktopPlay.updateSettings({ codexCompletionEnabled: false }));
    await expect(settings.locator('#chatgpt-completion-status')).toHaveText('ChatGPT Work 提醒已关闭');
    await appendFile(file, chatgptTurnEnd('off'));
    await pet.evaluate(() => window.desktopPlay.updateSettings({ codexCompletionEnabled: true }));
    await appendFile(file, chatgptTurnEnd('back-on'));
    await expect(pet.locator('.bubble-label')).toHaveText('ChatGPT Work 结束提醒');
    await expect(pet.locator('body')).toHaveAttribute('data-work-count', '4');
    await application.close(); application = await launch();
    const restarted = await application.firstWindow();
    await expect.poll(() => restarted.evaluate(async () => (await window.desktopPlay.getState()).chatgptCompletion.status)).toBe('watching');
    await expect(restarted.locator('.pet-bubble')).toBeHidden();
    expect((await restarted.evaluate(() => window.desktopPlay.getState())).settings.completionMessagesByPersona).toEqual(custom);
    await appendFile(file, chatgptTurnEnd('after-restart')); await expect(restarted.locator('.bubble-message')).toHaveText(custom.dragon);
  } finally { await application.close(); }
});
