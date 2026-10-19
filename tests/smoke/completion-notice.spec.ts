import { test, expect, _electron as electron } from '@playwright/test';
import type { Page } from '@playwright/test';
import electronPath from 'electron';
import path from 'node:path';
import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { electronArgs } from './electron-args';
import { codexHistoryFixture } from '../fixtures/codex-history';

const metadata = (id: string) => `${JSON.stringify({ type: 'session_meta', payload: { id, source: 'vscode' } })}\n`;
const finished = (id: string) => `${JSON.stringify({ type: 'event_msg', timestamp: new Date().toISOString(), payload: { type: 'task_complete', turn_id: id, last_agent_message: 'PRIVATE CONTENT MUST NOT APPEAR' } })}\n`;
async function launch(profile: string, home: string) {
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1', DESKTOPPLAY_TEST_CODEX_HOME: home };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env });
}
async function page(settings: Page, category: string, tab: string) {
  await settings.locator(`[data-category="${category}"]`).click(); await settings.locator(`#tab-${tab}`).click();
}
async function profile() {
  await mkdir('.tmp', { recursive: true });
  const directory = await mkdtemp(path.resolve('.tmp/smoke-completion-'));
  const home = path.join(directory, 'fake-codex'), sessions = path.join(home, 'sessions', '2020', '01', '01');
  await mkdir(sessions, { recursive: true });
  const file = path.join(sessions, 'rollout.jsonl'); await writeFile(file, metadata('client') + finished('history'));
  return { directory, home, file };
}

test('desktop SQLite WAL completions notify without new JSONL, share deduplication and discard hidden history', async () => {
  const f = await profile(), db = codexHistoryFixture(f.home);
  db.root(); db.turn('before-start', Date.now()); db.turn('running', null, 'inProgress');
  const application = await launch(f.directory, f.home);
  try {
    const pet = await application.firstWindow();
    await expect.poll(() => pet.evaluate(async () => (await window.desktopPlay.getState()).codexCompletion.status)).toBe('watching');
    await expect(pet.locator('.pet-bubble')).toBeHidden();
    await pet.evaluate(async () => {
      window.desktopPlay.onCodexCompletion(() => { document.body.dataset.sqliteCount = String(Number(document.body.dataset.sqliteCount ?? 0) + 1); });
      await window.desktopPlay.selectPet('gpt'); await window.desktopPlay.selectGptAppearance('dragon');
      await window.desktopPlay.openSettings();
    });
    const settings = application.windows().find(win => win !== pet) ?? await application.waitForEvent('window');
    await settings.bringToFront();
    const focused = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id);
    db.turn('running', Date.now());
    await expect(pet.locator('.bubble-label')).toHaveText('GPT 完成提醒');
    await expect(pet.locator('.bubble-message')).toHaveText('GPT 的答复已送达，我替你守候着。');
    expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id)).toBe(focused);
    await pet.screenshot({ path: 'test-results/completion-desktop-sqlite.png', omitBackground: true });
    await writeFile(f.file, metadata('desktop') + finished('running'));
    await new Promise(resolve => setTimeout(resolve, 2200));
    expect(await pet.locator('body').getAttribute('data-sqlite-count')).toBe('1');
    await pet.evaluate(() => window.desktopPlay.hidePet());
    db.turn('hidden-quick-show', Date.now());
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('view=pet'))!.showInactive());
    await new Promise(resolve => setTimeout(resolve, 2200));
    await expect(pet.locator('.pet-bubble')).toBeHidden();
    expect(await pet.locator('body').getAttribute('data-sqlite-count')).toBe('1');
    db.turn('visible-again', Date.now());
    await expect(pet.locator('.pet-bubble')).toBeVisible();
    await expect(pet.locator('.bubble-label')).toHaveText('GPT 完成提醒');
    await expect(pet.locator('body')).toHaveAttribute('data-sqlite-count', '2');
  } finally { await application.close(); db.close(); }
});

test('local events use editable persona text, preserve drafts and focus, respect hidden state and persist directory/settings', async () => {
  test.setTimeout(90000);
  const f = await profile(); let application = await launch(f.directory, f.home);
  try {
    let pet = await application.firstWindow();
    await expect(pet.locator('.pet-character')).toBeVisible();
    await expect.poll(() => pet.evaluate(async () => (await window.desktopPlay.getState()).codexCompletion.status)).toBe('watching');
    await expect(pet.locator('.pet-bubble')).toBeHidden();
    await pet.evaluate(() => { window.desktopPlay.onCodexCompletion(() => { document.body.dataset.completionCount = String(Number(document.body.dataset.completionCount ?? 0) + 1); }); });
    await pet.evaluate(() => window.desktopPlay.openSettings());
    const settings = application.windows().find(win => win !== pet) ?? await application.waitForEvent('window');
    await page(settings, 'reminders', 'completion');
    await expect(settings.locator('#completion-enabled')).toBeChecked();
    const custom = { whale: '小鲸鱼：GPT 已完成', gpt: '<b>GPT 输出完成</b>', dragon: '白龙已经替你等到答复了。' };
    const defaults = ['GPT 已经回复完啦，快去看看吧～', '这轮输出完成了，来看看结果吧。', 'GPT 的答复已送达，我替你守候着。'];
    for (const [index, persona] of (['whale', 'gpt', 'dragon'] as const).entries()) {
      await settings.locator(`[data-completion-persona="${persona}"]`).click();
      await expect(settings.locator('#completion-message')).toHaveValue(defaults[index]);
      await settings.locator('#completion-message').fill(custom[persona]);
    }
    await settings.locator('#completion-reset-message').click();
    await expect(settings.locator('#completion-message')).toHaveValue(defaults[2]);
    await settings.locator('#completion-message').fill(custom.dragon);
    await page(settings, 'account', 'codex'); await page(settings, 'reminders', 'completion');
    for (const persona of ['whale', 'gpt', 'dragon'] as const) {
      await settings.locator(`[data-completion-persona="${persona}"]`).click();
      await expect(settings.locator('#completion-message')).toHaveValue(custom[persona]);
    }
    expect((await settings.evaluate(() => window.desktopPlay.getState())).settings.completionMessagesByPersona.whale).toBe(defaults[0]);

    const chosen = path.join(f.directory, 'chosen-codex'); await mkdir(path.join(chosen, 'sessions'), { recursive: true });
    const chosenFile = path.join(chosen, 'sessions', 'desktop.jsonl'); await writeFile(chosenFile, metadata('chosen-client') + finished('before-choice'));
    await application.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }); }, chosen);
    await settings.locator('#completion-choose-directory').click();
    await expect(settings.locator('#completion-directory')).toHaveValue(chosen);
    expect((await settings.evaluate(() => window.desktopPlay.getState())).settings.codexCompletionDirectory).toBeNull();
    await settings.locator('#save-settings').click();
    await expect.poll(() => settings.evaluate(async () => (await window.desktopPlay.getState()).settings.completionMessagesByPersona)).toEqual(custom);
    await expect(settings.locator('#completion-current-directory')).toContainText(chosen);
    await expect(settings.locator('#completion-status')).toHaveText('正在监听新的完成事件');
    await settings.screenshot({ path: 'test-results/completion-settings.png' });

    for (const persona of ['whale', 'gpt', 'dragon'] as const) {
      await pet.evaluate(async persona => { await window.desktopPlay.selectPet(persona === 'whale' ? 'deepseek' : 'gpt'); if (persona !== 'whale') await window.desktopPlay.selectGptAppearance(persona === 'dragon' ? 'dragon' : 'classic'); }, persona);
      await settings.bringToFront();
      const focused = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id);
      await appendFile(chosenFile, finished(persona));
      await expect(pet.locator('.bubble-label')).toHaveText('GPT 完成提醒');
      await expect(pet.locator('.bubble-message')).toHaveText(custom[persona]);
      expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id)).toBe(focused);
      expect((await pet.evaluate(() => window.desktopPlay.getState())).activePet).toBe(persona === 'whale' ? 'deepseek' : 'gpt');
      await expect(pet.locator('.bubble-message b')).toHaveCount(0);
      await pet.screenshot({ path: `test-results/completion-${persona}.png`, omitBackground: true });
      await pet.locator('.bubble-close').dispatchEvent('click');
    }
    const count = await pet.locator('body').getAttribute('data-completion-count');
    await pet.evaluate(() => window.desktopPlay.hidePet()); await appendFile(chosenFile, finished('hidden'));
    await new Promise(resolve => setTimeout(resolve, 2300));
    expect(await pet.locator('body').getAttribute('data-completion-count')).toBe(count);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('view=pet'))!.showInactive());
    await expect(pet.locator('.pet-bubble')).toBeHidden();

    // A completion written while hidden must not arrive later through the polling fallback.
    await pet.evaluate(() => window.desktopPlay.hidePet());
    await appendFile(chosenFile, finished('hidden-then-quick-show'));
    await new Promise(resolve => setTimeout(resolve, 10));
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('view=pet'))!.showInactive());
    await new Promise(resolve => setTimeout(resolve, 2300));
    await expect(pet.locator('.pet-bubble')).toBeHidden();

    await pet.evaluate(() => window.desktopPlay.updateSettings({ codexCompletionEnabled: false }));
    await appendFile(chosenFile, finished('disabled'));
    await pet.evaluate(() => window.desktopPlay.updateSettings({ codexCompletionEnabled: true }));
    await expect(pet.locator('.pet-bubble')).toBeHidden();
    await appendFile(chosenFile, finished('enabled-again'));
    await expect(pet.locator('.bubble-message')).toHaveText(custom.dragon);
    expect(await pet.locator('body').textContent()).not.toContain('PRIVATE CONTENT');
    await application.close(); application = await launch(f.directory, f.home); pet = await application.firstWindow();
    await expect(pet.locator('.pet-character')).toBeVisible();
    await expect.poll(() => pet.evaluate(async () => (await window.desktopPlay.getState()).codexCompletion.status)).toBe('watching');
    expect((await pet.evaluate(() => window.desktopPlay.getState())).settings).toMatchObject({ codexCompletionEnabled: true, codexCompletionDirectory: chosen, completionMessagesByPersona: custom });
    await expect(pet.locator('.pet-bubble')).toBeHidden();
  } finally { await application.close(); }
});

test('completion bubbles reuse timing/hover, merge deferred events, use the displayed persona and clear pending on hide', async () => {
  const f = await profile(), application = await launch(f.directory, f.home);
  try {
    const pet = await application.firstWindow(); await expect(pet.locator('.pet-character')).toBeVisible();
    const now = Date.now(); await pet.clock.install({ time: now }); await pet.clock.pauseAt(now + 1000);
    const emit = (id: string) => application.evaluate(({ BrowserWindow }, id) => { BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('view=pet'))!.webContents.send('desktopplay:codex-completion', { id, completedAt: new Date().toISOString() }); }, id);
    const bubble = pet.locator('.pet-bubble');
    await emit('timer'); await pet.clock.runFor(150); await expect(bubble).toBeVisible();
    await pet.clock.runFor(1000); await emit('timer');
    await pet.clock.runFor(1999); await expect(bubble).toBeVisible(); await pet.clock.runFor(1); await expect(bubble).toBeHidden();

    await pet.evaluate(() => window.desktopPlay.updateSettings({ bubbleDurationSeconds: 2, bubbleHoverDelaySeconds: 1 }));
    await emit('hover'); await pet.clock.runFor(150); await bubble.dispatchEvent('pointerenter');
    await pet.clock.runFor(9000); await expect(bubble).toBeVisible();
    await bubble.dispatchEvent('pointerleave'); await pet.clock.runFor(999); await expect(bubble).toBeVisible();
    await pet.clock.runFor(1); await expect(bubble).toBeHidden();
    await pet.evaluate(() => window.desktopPlay.updateSettings({ bubbleDurationSeconds: 3, bubbleHoverDelaySeconds: 0 }));

    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 });
    await pet.locator('.bubble-switch').dispatchEvent('click');
    await emit('pending-one'); await emit('pending-two'); await pet.clock.runFor(150);
    await expect(pet.locator('.bubble-confirm')).toBeVisible();
    await pet.clock.runFor(5000); await expect(pet.locator('.bubble-confirm')).toBeVisible();
    await pet.locator('.bubble-cancel').dispatchEvent('click');
    await expect(pet.locator('.bubble-message')).toHaveText('GPT 已经回复完啦，快去看看吧～');
    await pet.locator('.bubble-close').dispatchEvent('click');
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 }); await pet.locator('.bubble-switch').dispatchEvent('click');
    await emit('switch-persona'); await pet.clock.runFor(150); await pet.locator('.bubble-confirm').dispatchEvent('click');
    await expect(pet.locator('.bubble-message')).toHaveText('这轮输出完成了，来看看结果吧。');

    await pet.locator('.bubble-close').dispatchEvent('click');
    const box = (await pet.locator('.pet-character').boundingBox())!;
    await pet.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await pet.mouse.down();
    await emit('dragging'); await pet.clock.runFor(150); await expect(bubble).toBeHidden();
    await pet.mouse.up(); await expect(pet.locator('.bubble-label')).toHaveText('GPT 完成提醒');

    await pet.locator('.bubble-switch').dispatchEvent('click'); await emit('hidden-pending'); await pet.clock.runFor(150);
    await pet.evaluate(() => window.desktopPlay.hidePet());
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
    await pet.clock.runFor(5000); await expect(bubble).toBeHidden();

    const state = await pet.evaluate(() => window.desktopPlay.getState()); state.gptAppearance = 'custom';
    await application.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0].webContents.send('desktopplay:state', state), state);
    await emit('custom-appearance'); await pet.clock.runFor(150);
    await expect(pet.locator('.bubble-message')).toHaveText('这轮输出完成了，来看看结果吧。');
    const messages = { ...state.settings.completionMessagesByPersona, gpt: '长文案'.repeat(66) + '完成' };
    await pet.evaluate(messages => window.desktopPlay.updateSettings({ completionMessagesByPersona: messages }), messages);
    await emit('long'); await pet.clock.runFor(150); await expect(pet.locator('.bubble-message')).toHaveText(messages.gpt);
    expect(await pet.locator('.bubble-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await pet.screenshot({ path: 'test-results/completion-long.png', omitBackground: true });
  } finally { await application.close(); }
});
