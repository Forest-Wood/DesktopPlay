import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import electronPath from 'electron';
import path from 'node:path';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { fitScale } from '../../src/main/geometry';

async function settingsPage(page: Page, category: string, tab: string) {
  await page.locator(`[data-category="${category}"]`).click();
  await page.locator(`#tab-${tab}`).click();
}

test('packaged renderer, secure bridge and persistent desktop settings', async () => {
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/smoke-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({ executablePath: electronPath as unknown as string, args: ['.'], cwd: process.cwd(), env });
    await expect.poll(() => application!.windows().length).toBe(2);
    await expect.poll(() => application!.windows().some(page => page.url().includes('view=settings'))).toBe(true);
    const settings = application.windows().find(page => page.url().includes('view=settings'))!;
    const pet = application.windows().find(page => page.url().includes('view=pet'))!;
    const errors: string[] = [];
    for (const page of [settings, pet]) page.on('pageerror', error => errors.push(error.message));
    await expect(settings.getByRole('heading', { name: '桌宠的栖息地' })).toBeVisible();
    await expect(settings.locator('#network-status')).toHaveText('尚未连接');
    await expect(pet.locator('.pet-image')).toBeVisible();
    expect(await settings.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined');
    expect(await settings.evaluate(() => window.desktopPlay.getState())).toMatchObject({ hasApiKey: false, status: 'unconfigured' });
    await settingsPage(settings, 'pet', 'appearance');
    await settings.locator('#scale').fill('1.25');
    await settingsPage(settings, 'preferences', 'sound');
    await settings.locator('input[name="soundEnabled"]').uncheck();
    await settingsPage(settings, 'reminders', 'reminders');
    await settings.locator('#low-balance').fill('10.12345678');
    await settingsPage(settings, 'pet', 'appearance');
    await expect(settings.locator('#scale')).toHaveValue('1.25');
    expect((await settings.evaluate(() => window.desktopPlay.getState())).settings.scale).toBe(1);
    await settings.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(settings.locator('#operation-status')).toContainText('设置已保存');
    await expect.poll(async () => (await settings.evaluate(() => window.desktopPlay.getState())).settings.scale).toBe(1.25);
    const windows = await application.evaluate(({ BrowserWindow, screen }) => BrowserWindow.getAllWindows().map(w => ({ isPet: w.webContents.getURL().includes('view=pet'), bounds: w.getBounds(), area: screen.getDisplayMatching(w.getBounds()).workArea, alwaysOnTop: w.isAlwaysOnTop() })));
    const petWindow = windows.find(w => w.isPet)!;
    const expectedScale = fitScale(1.25, petWindow.area);
    // Windows may round a physical-pixel edge outward at fractional DPI.
    expect(Math.abs(petWindow.bounds.width - Math.round(360 * expectedScale))).toBeLessThanOrEqual(1);
    expect(Math.abs(petWindow.bounds.height - Math.round(440 * expectedScale))).toBeLessThanOrEqual(1);
    expect(petWindow?.alwaysOnTop).toBe(true);
    expect(await settings.evaluate(async () => { try { await window.desktopPlay.updateSettings({ scale: 900 }); return false; } catch { return true; } })).toBe(true);
    expect(await settings.evaluate(async () => { try { await window.desktopPlay.setApiKey('  '); return false; } catch { return true; } })).toBe(true);

    const imported = path.resolve('public/assets/whale.png');
    await application.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, imported);
    await settingsPage(settings, 'pet', 'appearance');
    await settings.locator('#choose-pet').click();
    await expect.poll(async () => (await settings.evaluate(() => window.desktopPlay.getState())).pet.isCustom).toBe(true);
    expect(await settings.locator('#pet-preview-image').evaluate((img: HTMLImageElement) => img.src.startsWith('data:image/png;base64,'))).toBe(true);
    await settings.locator('#reset-pet').click();
    await expect.poll(async () => (await settings.evaluate(() => window.desktopPlay.getState())).pet.isCustom).toBe(false);

    await settings.evaluate(() => window.scrollTo(0, 0));
    await settings.screenshot({ path: 'test-results/settings-overview.png' });
    await settings.screenshot({ path: 'test-results/settings.png', fullPage: true });
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await expect(pet.locator('.pet-bubble')).toBeVisible();
    await pet.screenshot({ path: 'test-results/pet.png', omitBackground: true });
    expect(errors).toEqual([]);
    await settings.locator('#select-gpt').click();
    await expect.poll(async () => (await settings.evaluate(() => window.desktopPlay.getState())).activePet).toBe('gpt');
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', './assets/gpt.png');
    await expect.poll(async () => pet.locator('.pet-image').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await settings.evaluate(async () => { try { await window.desktopPlay.selectPet('invalid' as 'gpt'); return false; } catch { return true; } })).toBe(true);
    expect((await settings.evaluate(() => window.desktopPlay.getState())).codex.buckets).toEqual([]);
    await settings.locator('#appearance-dragon').click();
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', './assets/gpt-dragon-v2.png');
    expect((await settings.evaluate(() => window.desktopPlay.getState())).gptAppearance).toBe('dragon');
    expect(await settings.evaluate(async () => { try { await window.desktopPlay.selectGptAppearance('invalid' as 'dragon'); return false; } catch { return true; } })).toBe(true);
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await expect(pet.locator('.pet-bubble')).toBeVisible();
    await pet.screenshot({ path: 'test-results/gpt-pet.png', omitBackground: true });
    await settingsPage(settings, 'account', 'codex');
    await pet.locator('.bubble-close').click();
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    const quotaState = await settings.evaluate(() => window.desktopPlay.getState());
    for (const planType of ['plus', 'pro', null, 'team']) {
      const fixture = structuredClone(quotaState);
      fixture.codex = { ...fixture.codex, status: 'ready', planType, updatedAt: new Date().toISOString(), buckets: [{ id: 'codex', name: 'Codex', planType, primary: { usedPercent: 0.1, remainingPercent: 99.9, windowMinutes: 10080, resetsAt: new Date(Date.now() + 3600000).toISOString() }, secondary: planType === null ? null : { usedPercent: 0, remainingPercent: 100, windowMinutes: 300, resetsAt: new Date(Date.now() + 3600000).toISOString() }, creditsRemaining: null, unlimitedCredits: false }] };
      await application.evaluate(({ BrowserWindow }, state) => { for (const win of BrowserWindow.getAllWindows()) win.webContents.send('desktopplay:state', state); }, fixture);
      const label = planType === null ? '套餐未知' : planType === 'team' ? 'team' : planType === 'plus' ? 'Plus' : 'Pro';
      for (const page of [settings, pet]) {
        await expect(page.locator('.quota-plan-badge')).toHaveText(label);
        await expect(page.locator('.quota-window').nth(0).locator('.quota-percentage')).toHaveText(planType === null ? '未提供' : '100%');
        await expect(page.locator('.quota-window').nth(1).locator('.quota-percentage')).toHaveText('99.9%');
        const title = page.locator('.quota-window-title').first();
        expect(await title.evaluate(el => getComputedStyle(el).gap)).toBe('4px');
      }
      fixture.codex.status = 'error'; fixture.codex.error = 'smoke-refresh-failed';
      await application.evaluate(({ BrowserWindow }, state) => { for (const win of BrowserWindow.getAllWindows()) win.webContents.send('desktopplay:state', state); }, fixture);
      await expect(settings.locator('.quota-percentage').nth(1)).toHaveText('99.9%');
      await expect(settings.locator('.quota-stale')).toBeVisible();
    }
    await application.evaluate(({ BrowserWindow }, state) => { for (const win of BrowserWindow.getAllWindows()) win.webContents.send('desktopplay:state', state); }, quotaState);
    await settingsPage(settings, 'pet', 'companionship');
    for (const persona of ['whale', 'gpt', 'dragon']) {
      await settings.locator(`[data-persona="${persona}"]`).click();
      await settings.locator('#phrases').fill(`smoke-${persona}`);
    }
    await settingsPage(settings, 'about', 'guide');
    await settingsPage(settings, 'pet', 'companionship');
    await expect(settings.locator('#phrases')).toHaveValue('smoke-dragon');
    await settings.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect.poll(async () => (await settings.evaluate(() => window.desktopPlay.getState())).settings.phrasesByPersona).toEqual({ whale: ['smoke-whale'], gpt: ['smoke-gpt'], dragon: ['smoke-dragon'] });
    for (const appearance of ['classic', 'dragon'] as const) {
      await settings.evaluate(value => window.desktopPlay.selectGptAppearance(value), appearance);
      for (let click = 0; click < 2; click++) await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
      await expect(pet.locator('.bubble-message')).toHaveText(`smoke-${appearance === 'dragon' ? 'dragon' : 'gpt'}`);
    }
    for (const [category, tabs] of Object.entries({ account: ['overview', 'codex'], pet: ['appearance', 'companionship'], preferences: ['behavior', 'sound'], reminders: ['reminders', 'records'], about: ['version', 'guide', 'licenses'] })) {
      for (const tab of tabs) {
        await settingsPage(settings, category, tab);
        await expect(settings.locator(`#${tab}`)).toBeVisible();
        await expect(settings.locator('[role="tabpanel"]:visible')).toHaveCount(1);
        expect(await settings.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      }
    }
    await settingsPage(settings, 'account', 'codex');
    await settings.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    const lightColor = await settings.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await settings.screenshot({ path: 'test-results/settings-light.png' });
    await settings.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => settings.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(lightColor);
    await settings.screenshot({ path: 'test-results/settings-dark.png' });
    await settings.locator('#tab-codex').focus();
    await expect(settings.locator('#tab-codex')).toBeFocused();

    await application.close(); application = undefined;

    application = await electron.launch({ executablePath: electronPath as unknown as string, args: ['.'], cwd: process.cwd(), env });
    await expect.poll(() => application!.windows().length).toBe(2);
    await expect.poll(() => application!.windows().some(page => page.url().includes('view=settings'))).toBe(true);
    const restarted = application.windows().find(page => page.url().includes('view=settings'))!;
    await expect(restarted.locator('#codex-status')).toBeVisible();
    expect((await restarted.evaluate(() => window.desktopPlay.getState())).settings).toMatchObject({ scale: 1.25, soundEnabled: false, lowBalanceThreshold: '10.12345678' });
    expect((await restarted.evaluate(() => window.desktopPlay.getState())).activePet).toBe('gpt');
    expect((await restarted.evaluate(() => window.desktopPlay.getState())).gptAppearance).toBe('dragon');
    await restarted.evaluate(() => window.desktopPlay.selectPet('deepseek'));
    expect((await restarted.evaluate(() => window.desktopPlay.getState())).activePet).toBe('deepseek');
  } finally { await application?.close(); }
});

test('comic bubble pages, retention and appearances work without opening settings', async () => {
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/smoke-switch-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({ executablePath: electronPath as unknown as string, args: ['.'], cwd: process.cwd(), env });
  try {
    const pet = await application.firstWindow();
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await expect(pet.locator('.bubble-page')).toHaveText('1/5');
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await expect(pet.locator('.bubble-label')).toHaveText('用量小报告');
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await expect(pet.locator('.bubble-message')).toHaveText('今天也要照顾好自己呀。');
    await pet.locator('.bubble-switch').click();
    await expect(pet.locator('.bubble-confirm')).toBeVisible();
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', './assets/whale.png');
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await expect(pet.locator('.bubble-confirm')).toBeVisible();
    await pet.locator('.bubble-cancel').click();
    await expect(pet.locator('.bubble-page')).toHaveText('3/5');
    await pet.locator('.bubble-switch').click();
    await pet.locator('.bubble-confirm').click();
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', './assets/gpt.png');
    await expect(pet.locator('.bubble-page')).toHaveText('1/5');
    await pet.locator('.bubble-appearance').click();
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', './assets/gpt-dragon-v2.png');
    await pet.locator('.bubble-appearance').click();
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', './assets/gpt.png');
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await pet.locator('.bubble-refresh').click();
    await expect(pet.locator('.bubble-page')).toHaveText('2/5');
    await pet.locator('.bubble-close').click();
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await expect(pet.locator('.bubble-page')).toHaveText('1/5');
    expect(application.windows()).toHaveLength(1);
    await pet.locator('.bubble-settings').click();
    await expect.poll(() => application.windows().some(page => page.url().includes('view=settings'))).toBe(true);
    const settings = application.windows().find(page => page.url().includes('view=settings'))!;
    await expect(settings.locator('#codex-status')).toHaveText('未连接 Codex');
    await settingsPage(settings, 'pet', 'appearance');
    await settings.locator('#select-deepseek').click();
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', './assets/whale.png');
  } finally { await application.close(); }
});

test('native layout follows the character anchor and keeps upside-down text upright', async () => {
  const profile = await mkdtemp(path.resolve('.tmp/smoke-orientation-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({ executablePath: electronPath as unknown as string, args: ['.'], cwd: process.cwd(), env });
  try {
    const pet = await application.firstWindow();
    await pet.locator('.pet-character').waitFor();
    await pet.evaluate(() => window.desktopPlay.updateSettings({ snapToEdges: false, soundEnabled: false }));
    const area = await application.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
    const moveCharacter = async (x: number, y: number) => {
      const state = await pet.evaluate(() => window.desktopPlay.getState());
      await application.evaluate(({ BrowserWindow, screen }, input) => {
        const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))!;
        const scale = win.getBounds().width / 360;
        win.setPosition(Math.round(input.x - (input.flipped ? 0 : 140) * scale), Math.round(input.y - (input.placement === 'above' ? 220 : 0) * scale));
        screen.emit('display-metrics-changed');
      }, { x, y, flipped: state.flipped, placement: state.bubblePlacement });
    };
    await moveCharacter(area.x + 50, area.y + 20);
    await expect.poll(async () => await pet.evaluate(() => window.desktopPlay.getState())).toMatchObject({ flipped: true, verticalFlipped: true, bubblePlacement: 'below' });
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    expect(await pet.locator('.pet-mirror').evaluate(el => getComputedStyle(el).transform)).toBe('matrix(-1, 0, 0, -1, 0, 0)');
    expect(await pet.locator('.pet-bubble').evaluate(el => getComputedStyle(el).transform)).toBe('none');
    const boxes = await pet.evaluate(() => ({ character: document.querySelector('.pet-character')!.getBoundingClientRect().toJSON(), bubble: document.querySelector('.pet-bubble')!.getBoundingClientRect().toJSON(), viewport: { width: innerWidth, height: innerHeight } }));
    expect(boxes.bubble.y).toBeGreaterThan(boxes.character.y);
    expect(boxes.bubble.right).toBeLessThanOrEqual(boxes.viewport.width);
    expect(boxes.bubble.bottom).toBeLessThanOrEqual(boxes.viewport.height);
    await pet.screenshot({ path: 'test-results/pet-inverted.png', omitBackground: true });
    await moveCharacter(area.x + area.width - 300, area.y + area.height - 260);
    await expect.poll(async () => await pet.evaluate(() => window.desktopPlay.getState())).toMatchObject({ flipped: false, verticalFlipped: false, bubblePlacement: 'above' });
    const layout = await pet.evaluate(() => ({ character: document.querySelector('.pet-character')!.getBoundingClientRect().toJSON(), bubble: document.querySelector('.pet-bubble')!.getBoundingClientRect().toJSON() }));
    expect(layout.bubble.x).toBeLessThan(layout.character.x);
    expect(layout.bubble.y).toBeLessThan(layout.character.y);
    // All tooltip/buttons remain in the native hit rectangle after an orientation change.
    await pet.locator('.bubble-switch').click();
    await expect(pet.locator('.bubble-confirm')).toBeVisible();
  } finally { await application.close(); }
});

test('real held pointer presses preserve all mirror poses and cancel without paging', async () => {
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/smoke-pointer-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({ executablePath: electronPath as unknown as string, args: ['.'], cwd: process.cwd(), env });
  try {
    const pet = await application.firstWindow();
    await pet.locator('.pet-character').waitFor();
    await pet.evaluate(() => window.desktopPlay.updateSettings({ snapToEdges: false, soundEnabled: false, scale: 1 }));
    const area = await application.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
    const snapshot = async () => {
      const native = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
      const renderer = await pet.evaluate(() => {
        const character = document.querySelector('.pet-character')!.getBoundingClientRect();
        const mirror = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.pet-mirror')!).transform);
        const image = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.pet-image')!).transform);
        return { x: character.x, y: character.y, mirrorX: mirror.a, mirrorY: mirror.d, imageX: image.a, imageY: image.d };
      });
      const state = await pet.evaluate(() => window.desktopPlay.getState());
      return { ...renderer, screenX: native.x + renderer.x, screenY: native.y + renderer.y, flipped: state.flipped, verticalFlipped: state.verticalFlipped };
    };
    for (const flipped of [false, true]) for (const verticalFlipped of [false, true]) {
      await application.evaluate(({ BrowserWindow, screen }, input) => {
        const win = BrowserWindow.getAllWindows()[0];
        const character = input.character;
        const x = input.flipped ? input.area.x + 40 : input.area.x + input.area.width - 260;
        const y = input.verticalFlipped ? input.area.y + 10 : input.area.y + input.area.height - 250;
        win.setPosition(Math.round(x - character.x), Math.round(y - character.y));
        screen.emit('display-metrics-changed');
      }, { flipped, verticalFlipped, area, character: await pet.locator('.pet-character').evaluate(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })) });
      await expect.poll(async () => pet.evaluate(() => window.desktopPlay.getState())).toMatchObject({ flipped, verticalFlipped });
      await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
      const before = await snapshot();
      expect(before.mirrorX).toBe(flipped ? -1 : 1);
      expect(before.mirrorY).toBe(verticalFlipped ? -1 : 1);
      const rect = await pet.locator('.pet-character').boundingBox();
      await pet.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
      await pet.mouse.down();
      await expect(pet.locator('.pet-character')).toHaveClass(/pressed/);
      await pet.waitForTimeout(350);
      const held = await snapshot();
      expect(held.imageX).toBeGreaterThan(0);
      expect(held.imageY).toBeGreaterThan(0);
      expect(held.mirrorX).toBe(before.mirrorX);
      expect(held.mirrorY).toBe(before.mirrorY);
      expect(Math.abs(held.screenX - before.screenX)).toBeLessThanOrEqual(1);
      expect(Math.abs(held.screenY - before.screenY)).toBeLessThanOrEqual(1);
      const pageBefore = await pet.locator('.bubble-page').textContent();
      await pet.mouse.up();
      await expect(pet.locator('.pet-character')).not.toHaveClass(/pressed/);
      await expect(pet.locator('.bubble-page')).not.toHaveText(pageBefore!);
      const after = await snapshot();
      expect(after.flipped).toBe(flipped);
      expect(after.verticalFlipped).toBe(verticalFlipped);
      expect(Math.abs(after.screenX - before.screenX)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.screenY - before.screenY)).toBeLessThanOrEqual(1);
      for (const event of ['pointercancel', 'lostpointercapture']) {
        const currentPage = await pet.locator('.bubble-page').textContent();
        const box = await pet.locator('.pet-character').boundingBox();
        await pet.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
        await pet.evaluate(() => document.querySelector('.pet-character')!.addEventListener('pointerdown', event => { (window as unknown as { testPointerId: number }).testPointerId = (event as PointerEvent).pointerId; }, { once: true }));
        await pet.mouse.down();
        await pet.waitForTimeout(350);
        await pet.evaluate(eventName => {
          const character = document.querySelector('.pet-character')!;
          const pointerId = (window as unknown as { testPointerId: number }).testPointerId;
          character.dispatchEvent(new PointerEvent(eventName, { pointerId }));
        }, event);
        await expect(pet.locator('.pet-character')).not.toHaveClass(/pressed/);
        await pet.mouse.up();
        await expect(pet.locator('.bubble-page')).toHaveText(currentPage!);
      }
    }
  } finally { await application.close(); }
});
