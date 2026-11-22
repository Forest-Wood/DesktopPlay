import { expect, test, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { electronArgs } from './electron-args';
import { selectStudioPersona, settingsPage } from './settings-page';

test('studio keeps the selected persona and drafts across tabs, and adapts its live preview', async ({}, info) => {
  await mkdir('.tmp/T038-smoke', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/T038-smoke/profile-'));
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
    const settings = app.windows().find(win => win !== pet) ?? await app.waitForEvent('window');

    await settingsPage(settings, 'appearance');
    const whaleName = settings.locator('[data-pet-nickname="whale"]');
    await expect(whaleName).toHaveAttribute('placeholder', '小鲸鱼');
    await whaleName.fill('澄海');
    await settings.locator('#save-settings').click();
    await expect(settings.locator('#companion-name')).toHaveText('澄海');
    await settingsPage(settings, 'home');
    await expect(settings.locator('#home-pet-name')).toHaveText('澄海');
    await settingsPage(settings, 'appearance');
    await whaleName.clear();
    await settings.locator('[data-pet-nickname="dragon"]').fill('白露');
    await settings.locator('#save-settings').click();
    await expect(settings.locator('#companion-name')).toHaveText('小鲸鱼');

    await settingsPage(settings, 'bubbles');
    await expect(settings.locator('#studio-personas [data-studio-role]')).toHaveCount(3);
    await selectStudioPersona(settings, 'dragon');
    await expect(settings.locator('[data-studio-gpt="dragon"]')).toHaveText('白露');
    const scene = settings.locator('[data-bubble-scene="completion-codex"]');
    await scene.click();
    await expect(settings.locator('#bubble-scenario')).toHaveValue('completion-codex');
    await settings.locator('#bubble-copy').fill('白龙的独立完成文案');
    await settings.locator('#bubble-style-override').check();
    await expect(scene).toHaveAttribute('data-override', 'true');
    await settingsPage(settings, 'companionship');
    await expect(settings.locator('[data-studio-gpt="dragon"]')).toHaveAttribute('aria-pressed', 'true');
    const phrases = settings.locator('#phrases');
    const savedPhrases = await phrases.inputValue();
    await phrases.fill('白龙的陪伴草稿');
    await settings.locator('#phrase-count').fill('1');
    await expect(settings.locator('#phrase-preview-text')).toHaveText('白龙的陪伴草稿');
    await settingsPage(settings, 'sound');
    await expect(settings.locator('.studio-sound-card')).toHaveCount(6);
    await expect(settings.locator('[data-studio-gpt="dragon"]')).toHaveAttribute('aria-pressed', 'true');
    await settings.locator('[data-edit-sound="codex"]').click();
    await expect(settings.locator('#bubble-copy')).toHaveValue('白龙的独立完成文案');
    await expect(settings.locator('#bubble-preview-pet .bubble-message')).toHaveText('白龙的独立完成文案');
    await selectStudioPersona(settings, 'gpt');
    await expect(settings.locator('#bubble-copy')).not.toHaveValue('白龙的独立完成文案');
    await selectStudioPersona(settings, 'dragon');
    await expect(settings.locator('#bubble-copy')).toHaveValue('白龙的独立完成文案');

    for (const [width, height] of [[1060, 800], [760, 560]]) {
      await app.evaluate(({ BrowserWindow }, [w, h]) =>
        BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('view=settings'))!.setContentSize(w, h), [width, height]);
      await expect.poll(() => settings.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
      const layout = await settings.locator('.bubble-editor-preview').evaluate(el => {
        const bounds = el.getBoundingClientRect();
        const content = el.closest('.settings-content')!;
        const fields = document.querySelector('.bubble-editor-fields')!.getBoundingClientRect();
        const bubble = el.querySelector('.pet-bubble')!.getBoundingClientRect();
        const character = el.querySelector('.pet-character')!.getBoundingClientRect();
        const fits = [bubble, character].every(box =>
          box.width > 0 && box.left >= bounds.left && box.top >= bounds.top && box.right <= bounds.right + 1 && box.bottom <= bounds.bottom + 1);
        return { fits, beside: bounds.left > fields.left, noOverflow: content.scrollWidth <= content.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth };
      });
      expect(layout).toEqual({ fits: true, beside: width === 1060, noOverflow: true });
      await settings.locator('.settings-content').evaluate(el => { el.scrollTop = 0; });
      const preview = settings.locator('.bubble-editor-preview');
      await preview.scrollIntoViewIfNeeded();
      await expect(preview.locator('.pet-bubble')).toBeInViewport({ ratio: 0.99 });
      await expect(preview.locator('.pet-character')).toBeInViewport({ ratio: 0.99 });
      await settings.screenshot({ path: info.outputPath(`bubble-${width}x${height}.png`), scale: 'css' });
    }
    await settings.locator('#discard-settings').click();
    await expect(scene).toHaveAttribute('data-override', 'false');
    await settingsPage(settings, 'companionship');
    await expect(phrases).toHaveValue(savedPhrases);

    await settingsPage(settings, 'records');
    const simulated = await settings.evaluate(() => window.desktopPlay.getState());
    simulated.ledger.history = Array.from({ length: 16 }, (_, index) => {
      const date = `2026-10-${String(index + 1).padStart(2, '0')}`;
      return { date, currency: 'CNY', spent: String(index), increased: '0', startedAt: `${date}T00:00:00Z` };
    });
    await app.evaluate(({ BrowserWindow }, state) => {
      BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('view=settings'))!.webContents.send('desktopplay:state', state);
    }, simulated);
    await expect(settings.locator('.records-chart .ui-spark-bars span')).toHaveCount(14);
    await expect(settings.locator('#history-body tr')).toHaveCount(14);
    await settings.locator('#records-show-all').click();
    await expect(settings.locator('#history-body tr')).toHaveCount(16);
    await settings.locator('#records-show-all').click();
    await expect(settings.locator('#history-body tr')).toHaveCount(14);
  } finally { await app.close(); }
});
