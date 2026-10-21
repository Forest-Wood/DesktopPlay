import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import path from 'node:path';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { electronArgs } from './electron-args';

async function launchPet() {
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/smoke-v051-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, cwd: process.cwd(), env });
}

test('click bubbles last three seconds across personas, hover, page changes and state updates', async () => {
  const application = await launchPet();
  try {
    const pet = await application.firstWindow();
    await expect(pet.locator('.pet-character')).toBeVisible();
    const now = Date.parse('2026-10-15T04:00:00Z');
    await pet.clock.install({ time: now });
    await pet.clock.pauseAt(now + 1000);
    const bubble = pet.locator('.pet-bubble');
    const clickPet = () => pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    for (const persona of ['whale', 'gpt', 'dragon'] as const) {
      await pet.evaluate(async persona => {
        await window.desktopPlay.selectPet(persona === 'whale' ? 'deepseek' : 'gpt');
        if (persona !== 'whale') await window.desktopPlay.selectGptAppearance(persona === 'dragon' ? 'dragon' : 'classic');
      }, persona);
      await clickPet();
      await expect(bubble).toBeVisible();
      await bubble.dispatchEvent('pointerenter');
      await pet.clock.runFor(2999);
      await expect(bubble).toBeVisible();
      const state = await pet.evaluate(() => window.desktopPlay.getState());
      await application.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0].webContents.send('desktopplay:state', state), state);
      await pet.clock.runFor(1);
      await expect(bubble).toBeHidden();

      await clickPet();
      await expect(pet.locator('.bubble-page')).toHaveText('1/5');
      await pet.clock.runFor(1500);
      await clickPet();
      await expect(pet.locator('.bubble-page')).toHaveText('2/5');
      await bubble.dispatchEvent('pointerleave');
      await pet.clock.runFor(2999);
      await expect(bubble).toBeVisible();
      await pet.clock.runFor(1);
      await expect(bubble).toBeHidden();
    }
    // Switching confirmation still waits for a decision; cancelling resumes the three-second display.
    await clickPet();
    await pet.locator('.bubble-switch').click();
    await pet.clock.runFor(4000);
    await expect(pet.locator('.bubble-confirm')).toBeVisible();
    await pet.locator('.bubble-cancel').click();
    await pet.clock.runFor(2999);
    await expect(bubble).toBeVisible();
    await pet.clock.runFor(1);
    await expect(bubble).toBeHidden();
    await clickPet();
    await pet.locator('.bubble-close').click();
    await expect(bubble).toBeHidden();

    await pet.evaluate(() => window.desktopPlay.updateSettings({ bubbleDurationSeconds: 5, bubbleHoverDelaySeconds: 2 }));
    await clickPet();
    await pet.clock.runFor(4999);
    await expect(bubble).toBeVisible();
    await bubble.dispatchEvent('pointerenter');
    await pet.clock.runFor(10000);
    await expect(bubble).toBeVisible();
    await bubble.dispatchEvent('pointerleave');
    await pet.clock.runFor(1999);
    await expect(bubble).toBeVisible();
    await bubble.dispatchEvent('pointerenter');
    await pet.clock.runFor(5000);
    await expect(bubble).toBeVisible();
    await bubble.dispatchEvent('pointerleave');
    await pet.clock.runFor(1999);
    await expect(bubble).toBeVisible();
    await pet.clock.runFor(1);
    await expect(bubble).toBeHidden();

    await clickPet();
    await bubble.dispatchEvent('pointerenter');
    await pet.evaluate(() => window.desktopPlay.updateSettings({ bubbleHoverDelaySeconds: 0 }));
    await pet.clock.runFor(4999);
    await expect(bubble).toBeVisible();
    await pet.clock.runFor(1);
    await expect(bubble).toBeHidden();
  } finally { await application.close(); }
});

test('full weekly reset countdown stays on one line and fits both GPT appearances', async () => {
  const application = await launchPet();
  try {
    const pet = await application.firstWindow();
    await expect(pet.locator('.pet-character')).toBeVisible();
    const now = Date.parse('2026-10-15T04:00:00Z');
    await pet.clock.install({ time: now });
    await pet.clock.pauseAt(now + 1000);
    const frozenNow = now + 1000;
    const previews = path.resolve('docs/previews/v0.5.1');
    await mkdir(previews, { recursive: true });
    for (const appearance of ['classic', 'dragon'] as const) {
      await pet.evaluate(async appearance => { await window.desktopPlay.selectPet('gpt'); await window.desktopPlay.selectGptAppearance(appearance); }, appearance);
      const state = await pet.evaluate(() => window.desktopPlay.getState());
      for (const withFiveHour of [true, false]) {
        for (const reset of [new Date(frozenNow + (6 * 1440 + 23 * 60 + 59) * 60000).toISOString(), null, new Date(frozenNow - 1000).toISOString()]) {
          state.codex = { ...state.codex, status: 'ready', planType: 'plus', updatedAt: new Date(frozenNow).toISOString(), error: null, buckets: [{ id: 'codex', name: 'Codex · 演示数据', planType: 'plus', primary: { usedPercent: 23.4, remainingPercent: 76.6, windowMinutes: 10080, resetsAt: reset }, secondary: withFiveHour ? { usedPercent: 0.1, remainingPercent: 99.9, windowMinutes: 300, resetsAt: new Date(frozenNow + 299 * 60000).toISOString() } : null, creditsRemaining: null, unlimitedCredits: false }] };
          await application.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0].webContents.send('desktopplay:state', state), state);
          await pet.locator('.bubble-close').dispatchEvent('click');
          await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
          await expect(pet.locator('.quota-countdown').first()).toHaveText(reset === null ? '重置时间未知' : Date.parse(reset) < frozenNow ? '已到重置时间 · 待刷新' : '6天 23小时 59分钟后重置');
          for (const countdown of await pet.locator('.quota-countdown').all()) {
            const metrics = await countdown.evaluate(element => {
              const range = document.createRange(); range.selectNodeContents(element);
              const text = range.getBoundingClientRect(), column = element.parentElement!.getBoundingClientRect();
              return { lines: new Set(Array.from(range.getClientRects(), rect => rect.top)).size, fits: text.left >= column.left - 1 && text.right <= column.right + 1, noOverflow: element.scrollWidth <= element.clientWidth + 1 };
            });
            expect(metrics).toEqual({ lines: 1, fits: true, noOverflow: true });
          }
          expect(await pet.locator('.bubble-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
          if (withFiveHour && reset !== null && Date.parse(reset) > frozenNow) await pet.screenshot({ path: path.join(previews, `gpt-${appearance}-countdown.png`), omitBackground: true });
        }
      }
    }
    await pet.locator('.bubble-settings').click();
    await expect.poll(() => application.windows().some(page => page.url().includes('view=settings'))).toBe(true);
    const settings = application.windows().find(page => page.url().includes('view=settings'))!;
    for (const colorScheme of ['light', 'dark'] as const) {
      await settings.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      for (const selector of ['body', '.sidebar', '.save-bar', '.panel']) {
        await expect(settings.locator(selector).first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      }
      await expect(settings.locator('body')).toHaveCSS('background-image', 'none');
      await expect(settings.locator('body')).toHaveCSS('color-scheme', 'light');
    }
    await settings.screenshot({ path: path.join(previews, 'settings-white.png') });
    await settings.locator('[data-category="pet"]').click();
    await settings.locator('#tab-bubbles').click();
    await expect(settings.locator('#bubble-profile-duration')).toHaveValue('3');
    await expect(settings.locator('#bubble-profile-hover')).toHaveValue('0');
    await settings.screenshot({ path: path.join(previews, 'bubble-settings.png') });
    await expect(pet.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  } finally { await application.close(); }
});
