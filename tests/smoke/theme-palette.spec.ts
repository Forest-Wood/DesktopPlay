import { expect, test, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_THEME } from '../../src/shared/theme';
import { electronArgs } from './electron-args';
import { settingsPage } from './settings-page';

test('theme drafts preview instantly, apply by scope, survive restart, and reset', async ({}, info) => {
  await mkdir('.tmp/T040-smoke', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/T040-smoke/profile-'));
  const env = { ...process.env, DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' };
  delete (env as NodeJS.ProcessEnv).ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env });
  let app = await launch();
  const openSettings = async () => {
    const pet = await app.firstWindow();
    await pet.locator('.pet-character').waitFor();
    await pet.evaluate(() => window.desktopPlay.openSettings());
    return { pet, settings: app.windows().find(win => win !== pet) ?? await app.waitForEvent('window', { predicate: win => win !== pet }) };
  };
  try {
    let { pet, settings } = await openSettings();
    const saved = () => settings.evaluate(async () => (await window.desktopPlay.getState()).settings.theme);
    const accent = () => settings.evaluate(() => document.documentElement.style.getPropertyValue('--accent'));
    const save = async () => {
      await settings.locator('#save-settings').click();
      await expect(settings.locator('#save-hint')).toHaveText('设置已保存');
    };
    await pet.clock.setFixedTime(new Date('2026-11-22T12:00:00Z'));
    await pet.evaluate(() => window.desktopPlay.updateSettings({ bubbleDurationSeconds: 60, soundEnabled: false }));
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    const bubble = pet.locator('.pet-bubble');
    const first = await bubble.screenshot();
    await settingsPage(settings, 'palette');
    await expect(settings.locator('[data-theme-preset]')).toHaveCount(8);
    await expect(settings.locator('#theme-apply-pet')).not.toBeChecked();
    await settings.locator('#theme-sample').click();
    const candidates = settings.locator('[data-theme-sample]');
    await expect(candidates.first()).toBeVisible();
    const beforeAccent = await accent();
    await settings.locator('[data-theme-preset="starlight"]').click();
    expect(await accent()).not.toBe(beforeAccent);
    expect(await saved()).toEqual(DEFAULT_THEME);
    await settings.locator('#theme-texture').selectOption('stars');
    await expect(settings.locator('.sidebar')).toHaveCSS('background-image', /radial-gradient/);

    await settings.locator('#theme-apply-settings').uncheck();
    expect(await accent()).toBe('');
    await settings.locator('#theme-apply-settings').check();
    await settingsPage(settings, 'appearance');
    await settingsPage(settings, 'palette');
    await expect(settings.locator('#theme-texture')).toHaveValue('stars');
    await save();
    expect(await saved()).toMatchObject({ preset: 'starlight', texture: 'stars', applyToPet: false });
    expect((await bubble.screenshot()).equals(first)).toBe(true);

    await settings.locator('#theme-accent').fill('#ffffcc');
    await expect(settings.locator('#theme-adjustment')).toContainText('已自动加深');
    await expect(settings.locator('#theme-contrast')).toContainText('AA ✓');
    await settings.locator('#theme-zone-stage').check();
    await settings.locator('#theme-zone-stage-color').fill('#cc793c');
    await settings.locator('#theme-intensity').fill('1.2');
    await settings.locator('#theme-accent').fill('#oops');
    await expect(settings.locator('#theme-accent-error')).toBeVisible();
    await settings.locator('#save-settings').click();
    await expect(settings.locator('#operation-status')).toContainText('主题色');
    expect(await saved()).toMatchObject({ preset: 'starlight', intensity: 1 });
    await settings.locator('#discard-settings').click();
    await expect(settings.locator('#theme-zone-stage')).not.toBeChecked();
    await expect(settings.locator('#theme-accent')).toHaveValue('#6b4f99');

    await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, path.resolve('public/assets/whale.png'));
    const imported = await settings.evaluate(() => window.desktopPlay.choosePet());
    expect(imported.pet.isCustom).toBe(true);
    await settings.locator('#theme-sample').click();
    await expect(candidates.first()).toBeVisible();
    expect(await candidates.count()).toBeGreaterThanOrEqual(3);
    await candidates.first().click();
    await expect(settings.locator('#theme-accent')).toHaveValue(/^#[0-9a-f]{6}$/);
    await settings.locator('[data-theme-preset="persona"]').click();
    await expect(settings.locator('#theme-accent')).toHaveValue('#4b5f9b');
    await settings.evaluate(() => window.desktopPlay.selectPet('gemini'));
    await expect(settings.locator('#theme-accent')).toHaveValue('#7b579e');
    await settings.evaluate(() => window.desktopPlay.selectPet('deepseek'));
    await settings.locator('#discard-settings').click();

    await settings.locator('#theme-apply-pet').check();
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    const baseline = await bubble.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(await saved()).toMatchObject({ applyToPet: false });
    await save();
    await expect.poll(() => bubble.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(baseline);
    const themed = await saved();
    await settings.evaluate(async () => {
      const { settings } = await window.desktopPlay.getState();
      settings.bubbleProfilesByPersona.whale.rules.usage.style = { background: '#ffee99' };
      await window.desktopPlay.updateSettings({ bubbleProfilesByPersona: settings.bubbleProfilesByPersona });
    });
    await expect(bubble).toHaveCSS('background-color', 'rgb(255, 238, 153)');
    await app.close();

    app = await launch();
    ({ pet, settings } = await openSettings());
    await settingsPage(settings, 'palette');
    expect(await saved()).toEqual(themed);
    await expect(settings.locator('#theme-apply-pet')).toBeChecked();
    for (const [width, height, preset] of [[1060, 800, 'starlight'], [760, 560, 'sea']] as const) {
      await app.evaluate(({ BrowserWindow }, [w, h]) =>
        BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('view=settings'))!.setContentSize(w, h), [width, height]);
      await expect.poll(() => settings.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
      await settings.locator(`[data-theme-preset="${preset}"]`).click();
      await expect(settings.locator('#theme-contrast')).toBeInViewport();
      await settings.locator('.palette-preview').scrollIntoViewIfNeeded();
      await expect(settings.locator('.palette-preview')).toBeInViewport({ ratio: .98 });
      expect(await settings.locator('.settings-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await settings.screenshot({ path: info.outputPath(`palette-${preset}-${width}x${height}.png`), scale: 'css' });
    }
    await settings.locator('.palette-code summary').click();
    await settings.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
    await settings.locator('#theme-copy').click();
    await expect(settings.locator('#theme-code-text')).toHaveValue(/^DP1\./);
    await settings.locator('[data-theme-preset="apricot"]').click();
    await settings.locator('#theme-import').click();
    await expect(settings.locator('[data-theme-preset="sea"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await saved()).toEqual(themed);
    await settings.locator('#theme-reset').click();
    await expect(settings.locator('[data-theme-preset="sage"]')).toHaveAttribute('aria-pressed', 'true');
    await save();
    expect(await saved()).toEqual(DEFAULT_THEME);
  } finally { await app.close(); }
});
