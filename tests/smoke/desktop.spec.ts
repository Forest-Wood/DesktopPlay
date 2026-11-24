import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import electronPath from 'electron';
import path from 'node:path';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fitScale } from '../../src/main/geometry';
import { electronArgs } from './electron-args';
import { selectStudioPersona, settingsPage } from './settings-page';


function soundFixture(seed: number): Buffer {
  const rate = 8000, samples = rate * 6, bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(Math.sin(i * (210 + seed * 25) / rate * Math.PI * 2) * 600), 44 + i * 2);
  return bytes;
}

test('custom audio import/preview/reset and uninstall safeguards', async () => {
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/smoke-v050-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, cwd: process.cwd(), env });
  try {
    await expect.poll(() => application.windows().some(page => page.url().includes('view=settings'))).toBe(true);
    const settings = application.windows().find(page => page.url().includes('view=settings'))!;
    const pet = application.windows().find(page => page.url().includes('view=pet'))!;
    const errors: string[] = []; for (const page of [settings, pet]) page.on('pageerror', error => errors.push(error.message));
    await settingsPage(settings, 'sound');
    await settings.locator('input[name="soundEnabled"]').uncheck();
    await settings.locator('#volume').fill('0.45');
    const filename = path.join(profile, 'whale-press.wav'); await writeFile(filename, soundFixture(1));
    await application.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, filename);
    await settings.locator('#sound-choose-press').click();
    await expect.poll(async () => (await settings.evaluate(() => window.desktopPlay.getState())).sounds.whale.press.isCustom).toBe(true);
    await expect(settings.locator('#sound-name-press')).toHaveText('whale-press.wav');
    await settings.evaluate(() => {
      const media: { played: HTMLMediaElement[]; pauses: number } = { played: [], pauses: 0 };
      (window as unknown as { smokeMedia: typeof media }).smokeMedia = media;
      const play = HTMLMediaElement.prototype.play, pause = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.play = function () { media.played.push(this); return play.call(this); };
      HTMLMediaElement.prototype.pause = function () { media.pauses++; return pause.call(this); };
    });
    const audioSnapshot = () => settings.evaluate(() => {
      const media = (window as unknown as { smokeMedia: { played: HTMLMediaElement[]; pauses: number } }).smokeMedia;
      return { plays: media.played.length, volume: media.played.at(-1)?.volume, allStopped: media.played.every(audio => audio.paused) };
    });
    await settings.locator('#volume').fill('0'); await settings.locator('#sound-preview-press').click();
    await expect(settings.locator('#sound-warning-press')).toContainText('音量为零');
    expect((await audioSnapshot()).plays).toBe(0);
    await settings.locator('#volume').fill('0.45'); await settings.locator('#sound-preview-press').click();
    await expect.poll(async () => (await audioSnapshot()).plays).toBe(1);
    expect((await audioSnapshot()).volume).toBe(.45);
    await settings.locator('#sound-stop-press').click();
    await expect.poll(async () => (await audioSnapshot()).allStopped).toBe(true);
    await settings.locator('#sound-reset-press').click();
    await expect.poll(async () => (await settings.evaluate(() => window.desktopPlay.getState())).sounds.whale.press.isCustom).toBe(false);
    expect(await pet.evaluate(async () => { try { await window.desktopPlay.requestUninstall(false); return false; } catch { return true; } })).toBe(true);
    await application.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    });
    expect(await settings.evaluate(() => window.desktopPlay.requestUninstall(false))).toEqual({ started: false });
    await settingsPage(settings, 'uninstall');
    await expect(settings.locator('#uninstall-data')).toHaveText(profile);
    expect(errors).toEqual([]);
  } finally { await application.close(); }
});

test('packaged renderer, secure bridge and persistent desktop settings', async () => {
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/smoke-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, cwd: process.cwd(), env });
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
    await settingsPage(settings, 'behavior');
    await settings.locator('#scale').fill('1.25');
    await settingsPage(settings, 'sound');
    await settings.locator('input[name="soundEnabled"]').uncheck();
    await settingsPage(settings, 'bubbles');
    await settings.locator('#bubble-profile-duration').fill('7');
    await settings.locator('#bubble-profile-hover').fill('4');
    await settingsPage(settings, 'reminders');
    await settings.locator('#low-balance').fill('10.12345678');
    await settingsPage(settings, 'behavior');
    await expect(settings.locator('#scale')).toHaveValue('1.25');
    await settingsPage(settings, 'bubbles');
    await expect(settings.locator('#bubble-profile-duration')).toHaveValue('7');
    await expect(settings.locator('#bubble-profile-hover')).toHaveValue('4');
    expect((await settings.evaluate(() => window.desktopPlay.getState())).settings).toMatchObject({ bubbleDurationSeconds: 3, bubbleHoverDelaySeconds: 0 });
    await settingsPage(settings, 'appearance');
    expect((await settings.evaluate(() => window.desktopPlay.getState())).settings.scale).toBe(1);
    await settings.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(settings.locator('#save-hint')).toHaveText('设置已保存');
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
    await settingsPage(settings, 'appearance');
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
    await settingsPage(settings, 'codex');
    await pet.locator('.bubble-close').click();
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    const quotaState = await settings.evaluate(() => window.desktopPlay.getState());
    for (const planType of ['plus', null]) {
      const fixture = structuredClone(quotaState);
      fixture.codex = { ...fixture.codex, status: 'ready', planType, updatedAt: new Date().toISOString(), buckets: [{ id: 'codex', name: 'Codex', planType, primary: { usedPercent: 0.1, remainingPercent: 99.9, windowMinutes: 10080, resetsAt: new Date(Date.now() + 3600000).toISOString() }, secondary: planType === null ? null : { usedPercent: 0, remainingPercent: 100, windowMinutes: 300, resetsAt: new Date(Date.now() + 3600000).toISOString() }, creditsRemaining: null, unlimitedCredits: false }] };
      await application.evaluate(({ BrowserWindow }, state) => { for (const win of BrowserWindow.getAllWindows()) win.webContents.send('desktopplay:state', state); }, fixture);
      const label = planType === null ? '套餐未知' : 'Plus';
      for (const quota of [settings.locator('#codex-quotas'), pet.locator('.bubble-quota')]) {
        await expect(quota.locator('.quota-plan-badge')).toHaveText(label);
        await expect(quota.locator('.quota-window').first().locator('.quota-percentage')).toHaveText('99.9%');
        await expect(quota.locator('.quota-window')).toHaveCount(planType === null ? 1 : 2);
      }
      fixture.codex.status = 'error'; fixture.codex.error = 'smoke-refresh-failed';
      await application.evaluate(({ BrowserWindow }, state) => { for (const win of BrowserWindow.getAllWindows()) win.webContents.send('desktopplay:state', state); }, fixture);
      await expect(settings.locator('.quota-stale')).toBeVisible();
    }
    await application.evaluate(({ BrowserWindow }, state) => { for (const win of BrowserWindow.getAllWindows()) win.webContents.send('desktopplay:state', state); }, quotaState);
    await settingsPage(settings, 'companionship');
    for (const persona of ['whale', 'gpt', 'dragon', 'gemini'] as const) {
      await selectStudioPersona(settings, persona);
      await settings.locator('#phrases').fill(`smoke-${persona}`);
      await settings.locator('#phrase-count').fill('1');
    }
    await settingsPage(settings, 'guide');
    await settingsPage(settings, 'companionship');
    await expect(settings.locator('#phrases')).toHaveValue('smoke-gemini');
    await settings.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect.poll(async () => (await settings.evaluate(() => window.desktopPlay.getState())).settings.phrasesByPersona).toEqual({ whale: ['smoke-whale'], gpt: ['smoke-gpt'], dragon: ['smoke-dragon'], gemini: ['smoke-gemini'] });
    for (const appearance of ['classic', 'dragon'] as const) {
      await settings.evaluate(value => window.desktopPlay.selectGptAppearance(value), appearance);
      if (await pet.locator('.bubble-close').isVisible()) await pet.locator('.bubble-close').dispatchEvent('click');
      for (let click = 0; click < 3; click++) await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
      await expect(pet.locator('.bubble-message')).toHaveText(`smoke-${appearance === 'dragon' ? 'dragon' : 'gpt'}`);
    }
    for (const tab of ['appearance', 'behavior', 'overview', 'codex', 'gemini', 'records', 'completion', 'reminders', 'bubbles', 'companionship', 'sound', 'version', 'guide', 'licenses', 'uninstall'] as const) {
      await settingsPage(settings, tab);
      await expect(settings.locator(`#${tab}`)).toBeVisible();
      await expect(settings.locator('[role="tabpanel"]:visible')).toHaveCount(1);
      expect(await settings.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    }
    await settingsPage(settings, 'codex');
    await settings.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    const pageBackground = () => settings.evaluate(() => ({ color: getComputedStyle(document.body).backgroundColor, image: getComputedStyle(document.body).backgroundImage, scheme: getComputedStyle(document.body).colorScheme }));
    await expect.poll(pageBackground).toEqual({ color: 'rgb(255, 255, 255)', image: 'none', scheme: 'light' });
    await settings.screenshot({ path: 'test-results/settings-light.png' });
    await settings.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(pageBackground).toEqual({ color: 'rgb(255, 255, 255)', image: 'none', scheme: 'light' });
    await settings.screenshot({ path: 'test-results/settings-dark.png' });
    await settings.locator('#tab-codex').focus();
    await expect(settings.locator('#tab-codex')).toBeFocused();

    await application.close(); application = undefined;

    application = await electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, cwd: process.cwd(), env });
    await expect.poll(() => application!.windows().length).toBe(2);
    await expect.poll(() => application!.windows().some(page => page.url().includes('view=settings'))).toBe(true);
    const restarted = application.windows().find(page => page.url().includes('view=settings'))!;
    await expect(restarted.locator('#home')).toBeVisible();
    await settingsPage(restarted, 'codex');
    await expect(restarted.locator('#codex-status')).toBeVisible();
    expect((await restarted.evaluate(() => window.desktopPlay.getState())).settings).toMatchObject({ scale: 1.25, soundEnabled: false, lowBalanceThreshold: '10.12345678', bubbleProfilesByPersona: { whale: { timing: { durationSeconds: 7, hoverDelaySeconds: 4 } }, gpt: { timing: { durationSeconds: 3, hoverDelaySeconds: 0 } } } });
    expect((await restarted.evaluate(() => window.desktopPlay.getState())).activePet).toBe('gpt');
    expect((await restarted.evaluate(() => window.desktopPlay.getState())).gptAppearance).toBe('dragon');
    await restarted.evaluate(() => window.desktopPlay.selectPet('deepseek'));
    expect((await restarted.evaluate(() => window.desktopPlay.getState())).activePet).toBe('deepseek');
  } finally { await application?.close(); }
});

test('comic bubble pages, retention and appearances work without opening settings', async ({}, info) => {
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/smoke-switch-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, cwd: process.cwd(), env });
  try {
    const pet = await application.firstWindow();
    await pet.evaluate(() => window.desktopPlay.updateSettings({ bubbleDurationSeconds: 60 }));
    const more = pet.locator('.bubble-more');
    const openMore = () => more.click();
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await expect(pet.locator('.bubble-page')).toHaveText('● ○ ○ ○ ○');
    await expect(pet.locator('.bubble-page')).toHaveAccessibleName('第 1 页，共 5 页');
    await pet.screenshot({ path: info.outputPath('deepseek-usage.png'), omitBackground: true });
    const bodyBounds = await pet.locator('.bubble-content').boundingBox();
    await more.press('Enter');
    const overlay = pet.getByRole('dialog', { name: '更多操作' });
    await expect(overlay).toBeVisible();
    await expect(pet.locator('.bubble-menu-close')).toBeFocused();
    await pet.keyboard.press('Tab');
    await expect(pet.locator('.bubble-switch')).toBeFocused();
    expect(await pet.locator('.bubble-content').boundingBox()).toEqual(bodyBounds);
    const popupBounds = (await overlay.boundingBox())!, bubbleBounds = (await pet.locator('.pet-bubble').boundingBox())!;
    expect(popupBounds.x).toBeGreaterThanOrEqual(bubbleBounds.x);
    expect(popupBounds.y).toBeGreaterThanOrEqual(bubbleBounds.y);
    expect(popupBounds.x + popupBounds.width).toBeLessThanOrEqual(bubbleBounds.x + bubbleBounds.width);
    expect(popupBounds.y + popupBounds.height).toBeLessThanOrEqual(bubbleBounds.y + bubbleBounds.height);
    await pet.screenshot({ path: info.outputPath('deepseek-more.png'), omitBackground: true });
    await pet.keyboard.press('Escape');
    await expect(more).toBeFocused();
    await expect(overlay).toBeHidden();
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await expect(pet.locator('.bubble-label')).toHaveText('用量小报告');
    await openMore();
    await pet.locator('.bubble-switch').click();
    await expect(pet.locator('.bubble-label')).toHaveText('换角色挽留');
    await expect(pet.locator('.bubble-message')).toHaveText('我还想陪着你，再留一会儿，好吗？');
    await pet.locator('.bubble-cancel').click();
    await expect(pet.locator('.bubble-label')).toHaveText('用量小报告');
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await expect(pet.locator('.bubble-message')).toHaveText('今天也要照顾好自己呀。');
    await openMore();
    await pet.locator('.bubble-switch').click();
    await expect(pet.locator('.bubble-confirm')).toBeVisible();
    await expect(pet.locator('.bubble-message')).toHaveText('我还想陪着你，再留一会儿，好吗？');
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', './assets/whale.png');
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await expect(pet.locator('.bubble-confirm')).toBeVisible();
    await pet.locator('.bubble-cancel').click();
    await expect(pet.locator('.bubble-page')).toHaveAccessibleName('第 3 页，共 5 页');
    await expect(pet.locator('.bubble-message')).toHaveText('今天也要照顾好自己呀。');
    await openMore();
    await pet.locator('.bubble-switch').click();
    await pet.locator('.bubble-confirm').click();
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', './assets/gpt.png');
    await expect(pet.locator('.bubble-page')).toHaveAccessibleName('第 1 页，共 5 页');
    await openMore();
    await pet.locator('.bubble-appearance').click();
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', './assets/gpt-dragon-v2.png');
    await openMore();
    await pet.locator('.bubble-appearance').click();
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', './assets/gpt.png');
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await pet.locator('.bubble-refresh').click();
    await expect(pet.locator('.bubble-page')).toHaveAccessibleName('第 2 页，共 5 页');
    await pet.locator('.bubble-close').click();
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await expect(pet.locator('.bubble-page')).toHaveAccessibleName('第 1 页，共 5 页');
    expect(application.windows()).toHaveLength(1);
    await openMore();
    await pet.locator('.bubble-settings').click();
    await expect.poll(() => application.windows().some(page => page.url().includes('view=settings'))).toBe(true);
    const settings = application.windows().find(page => page.url().includes('view=settings'))!;
    await expect(settings.locator('#codex-status')).toHaveText('未连接 Codex');
    await settingsPage(settings, 'appearance');
    await settings.locator('#select-deepseek').click();
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', './assets/whale.png');
  } finally { await application.close(); }
});

test('native layout follows the character anchor and keeps upside-down text upright', async ({}, info) => {
  const profile = await mkdtemp(path.resolve('.tmp/smoke-orientation-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, cwd: process.cwd(), env });
  try {
    const pet = await application.firstWindow();
    await pet.locator('.pet-character').waitFor();
    await pet.evaluate(() => window.desktopPlay.updateSettings({ snapToEdges: false, soundEnabled: false, bubbleDurationSeconds: 60 }));
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
    const tailMatrix = () => pet.locator('.pet-bubble').evaluate(el => {
      const m = new DOMMatrix(getComputedStyle(el, '::after').transform);
      return { a: m.a, d: m.d };
    });
    const invertedTail = await tailMatrix();
    expect(invertedTail.a).toBeLessThan(0);
    expect(invertedTail.d).toBeLessThan(0);
    const boxes = await pet.evaluate(() => ({ character: document.querySelector('.pet-character')!.getBoundingClientRect().toJSON(), bubble: document.querySelector('.pet-bubble')!.getBoundingClientRect().toJSON(), viewport: { width: innerWidth, height: innerHeight } }));
    expect(boxes.bubble.y).toBeGreaterThan(boxes.character.y);
    expect(boxes.bubble.right).toBeLessThanOrEqual(boxes.viewport.width);
    expect(boxes.bubble.bottom).toBeLessThanOrEqual(boxes.viewport.height);
    await pet.screenshot({ path: info.outputPath('pet-inverted.png'), omitBackground: true });
    await pet.locator('.bubble-more').click();
    await expect(pet.getByRole('dialog', { name: '更多操作' })).toBeVisible();
    await pet.screenshot({ path: info.outputPath('pet-inverted-more.png'), omitBackground: true });
    await pet.locator('.bubble-menu-close').click();
    await moveCharacter(area.x + area.width - 300, area.y + area.height - 260);
    await expect.poll(async () => await pet.evaluate(() => window.desktopPlay.getState())).toMatchObject({ flipped: false, verticalFlipped: false, bubblePlacement: 'above' });
    const uprightTail = await tailMatrix();
    expect(uprightTail.a).toBeGreaterThan(0);
    expect(uprightTail.d).toBeGreaterThan(0);
    const layout = await pet.evaluate(() => ({ character: document.querySelector('.pet-character')!.getBoundingClientRect().toJSON(), bubble: document.querySelector('.pet-bubble')!.getBoundingClientRect().toJSON() }));
    expect(layout.bubble.x).toBeLessThan(layout.character.x);
    expect(layout.bubble.y).toBeLessThan(layout.character.y);
    // All tooltip/buttons remain in the native hit rectangle after an orientation change.
    await pet.locator('.bubble-more').click();
    await pet.locator('.bubble-switch').click();
    await expect(pet.locator('.bubble-confirm')).toBeVisible();
  } finally { await application.close(); }
});
