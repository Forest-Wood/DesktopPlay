import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import path from 'node:path';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { electronArgs } from './electron-args';

test('reset cards keep authoritative count, local cutoff detail and compact persona layout', async () => {
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/smoke-resets-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env });
  try {
    const pet = await application.firstWindow();
    await expect(pet.locator('.pet-character')).toBeVisible();
    await pet.evaluate(async () => { await window.desktopPlay.selectPet('gpt'); await window.desktopPlay.updateSettings({ bubbleDurationSeconds: 60 }); await window.desktopPlay.openSettings(); });
    const settings = application.windows().find(win => win !== pet) ?? await application.waitForEvent('window', { predicate: win => win !== pet });
    await expect(settings.locator('#codex-quotas')).toBeVisible();
    const base = await pet.evaluate(() => window.desktopPlay.getState());
    base.codex = { ...base.codex, status: 'ready', planType: 'pro', updatedAt: new Date().toISOString(), error: null,
      buckets: [{ id: 'codex', name: 'Codex', planType: 'pro', primary: { usedPercent: 23.4, remainingPercent: 76.6, windowMinutes: 10080, resetsAt: new Date(Date.now() + 604740000).toISOString() }, secondary: { usedPercent: 0.1, remainingPercent: 99.9, windowMinutes: 300, resetsAt: null }, creditsRemaining: null, unlimitedCredits: false }],
      resetCredits: { availableCount: 8, credits: [
        { id: 'last', status: 'available', expiresAt: '2031-06-02T12:34:56Z' },
        { id: 'first', status: 'available', expiresAt: '2031-06-01T12:34:56Z' },
        { id: 'forever', status: 'available', expiresAt: null }, { id: 'unknown', status: 'available' },
      ] },
    };
    const publish = () => application.evaluate(({ BrowserWindow }, state) => { for (const win of BrowserWindow.getAllWindows()) win.webContents.send('desktopplay:state', state); }, base);
    await publish();
    await expect(settings.locator('.quota-reset-count')).toHaveText('重置卡 8 张');
    await expect(settings.locator('.quota-reset-row')).toHaveCount(4);
    await expect(settings.locator('.quota-reset-row').first()).toContainText('2031/06/01');
    await expect(settings.locator('.quota-reset-row').first()).toContainText('GMT');
    await expect(settings.locator('.quota-reset-list')).toContainText('无到期限制');
    await expect(settings.locator('.quota-reset-list')).toContainText('截止时间未提供');
    await expect(settings.locator('.quota-reset-credits')).toContainText('明细不完整');
    await settings.screenshot({ path: 'test-results/reset-cards-settings-details.png' });
    for (const appearance of ['classic', 'dragon'] as const) {
      await pet.evaluate(appearance => window.desktopPlay.selectGptAppearance(appearance), appearance);
      base.gptAppearance = appearance;
      base.pet = (await pet.evaluate(() => window.desktopPlay.getState())).pet;
      await publish();
      await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
      await expect(pet.locator('.quota-reset-count')).toHaveText('重置卡 8 张');
      await expect(pet.locator('.quota-reset-deadline')).toContainText('2031/06/01');
      const fits = await pet.locator('.quota-reset-credits').evaluate(el => {
        const rect = el.getBoundingClientRect(), parent = el.closest('.bubble-content')!.getBoundingClientRect();
        return rect.left >= parent.left && rect.right <= parent.right + 1 && rect.bottom <= parent.bottom + 1 && el.scrollWidth <= el.clientWidth + 1;
      });
      expect(fits).toBe(true);
      const resetSpacing = await pet.locator('.quota-reset-credits').evaluate(el => {
        const bucket = el.previousElementSibling!;
        return (el.getBoundingClientRect().top - bucket.getBoundingClientRect().bottom) / (document.querySelector('.pet-canvas')!.getBoundingClientRect().width / 360);
      });
      expect(resetSpacing).toBeGreaterThanOrEqual(11.9);
      expect(await pet.locator('.bubble-content').evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      await pet.screenshot({ path: `test-results/reset-cards-${appearance}.png`, omitBackground: true });
      await pet.locator('.bubble-close').dispatchEvent('click');
    }
    base.codex.status = 'error'; await publish();
    await expect(settings.locator('.quota-reset-count')).toContainText('8 张 · 待刷新');
    base.codex.status = 'ready'; base.codex.resetCredits = { availableCount: 0, credits: [] }; await publish();
    await expect(settings.locator('.quota-reset-count')).toHaveText('重置卡 0 张');
    base.codex.resetCredits = { availableCount: 2, credits: null }; await publish();
    await expect(settings.locator('.quota-reset-credits')).toContainText('接口仅提供张数');
    base.codex.resetCredits = null; await publish();
    await expect(settings.locator('.quota-reset-count')).toHaveText('重置卡：未提供');
    await settings.screenshot({ path: 'test-results/reset-cards-settings.png' });
  } finally { await application.close(); }
});
