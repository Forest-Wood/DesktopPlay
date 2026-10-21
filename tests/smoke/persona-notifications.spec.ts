import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zstdCompressSync, constants } from 'node:zlib';
import { electronArgs } from './electron-args';
import type { CompletionSource } from '../../src/shared/types';

const personas = ['whale', 'gpt', 'dragon'] as const;
const sources: CompletionSource[] = ['codex', 'chatgpt-work', 'deepseek-harness'];
const frame = (rows: unknown[]) => zstdCompressSync(Buffer.from(rows.map(row => JSON.stringify(row) + '\n').join('')), { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
const finished = (turn: number, reason = 'completed') => ({ type: 'turn/end', seq: turn * 2 + 1, time: Date.now(), data: { turn, reason: { kind: reason } } });
async function fixture() {
  await mkdir('.tmp', { recursive: true }); const profile = await mkdtemp(path.resolve('.tmp/smoke-T010-'));
  const sessions = path.join(profile, 'dsh-sessions'); await mkdir(path.join(sessions, 'project', 'root'), { recursive: true });
  const file = path.join(sessions, 'project', 'root', 'session.v4.jsonl.zstd');
  await writeFile(file, frame([{ type: 'session', version: 4, id: 'fixture-root', createdAt: Date.now(), isSeeded: false, delegationDepth: 0 }, finished(0)]));
  const env = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1', DESKTOPPLAY_TEST_DSH_SESSIONS: sessions };
  delete (env as Record<string, string>).ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env });
  return { profile, sessions, file, launch };
}

test('DSH compressed logs notify all personas without focus changes, filter failed ends and discard hidden history', async () => {
  const f = await fixture(), app = await f.launch();
  try {
    const pet = await app.firstWindow(); await expect.poll(() => pet.evaluate(async () => (await window.desktopPlay.getState()).deepseekCompletion.status)).toBe('watching');
    await expect(pet.locator('.pet-bubble')).toBeHidden();
    await pet.evaluate(() => { window.desktopPlay.onCodexCompletion(notice => { document.body.dataset.notice = JSON.stringify(notice); document.body.dataset.count = String(Number(document.body.dataset.count ?? 0) + 1); }); return window.desktopPlay.openSettings(); });
    const settings = app.windows().find(page => page !== pet) ?? await app.waitForEvent('window');
    for (const [index, persona] of personas.entries()) {
      await pet.evaluate(async persona => { await window.desktopPlay.selectPet(persona === 'whale' ? 'deepseek' : 'gpt'); if (persona !== 'whale') await window.desktopPlay.selectGptAppearance(persona === 'dragon' ? 'dragon' : 'classic'); }, persona);
      await settings.bringToFront(); const focused = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id);
      const bytes = frame([finished(index + 1)]); await appendFile(f.file, bytes.subarray(0, -2));
      await new Promise(resolve => setTimeout(resolve, 250)); await expect(pet.locator('.pet-bubble')).toBeHidden();
      await appendFile(f.file, bytes.subarray(-2)); await expect(pet.locator('.pet-bubble')).toBeVisible();
      await expect(pet.locator('.bubble-label')).toHaveText('DeepSeek Harness 完成提醒');
      const state = await pet.evaluate(() => window.desktopPlay.getState()); await expect(pet.locator('.bubble-message')).toHaveText(state.settings.bubbleProfilesByPersona[persona].rules['completion-deepseek-harness'].message);
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id)).toBe(focused);
      expect(JSON.parse((await pet.locator('body').getAttribute('data-notice'))!)).toMatchObject({ source: 'deepseek-harness' });
      await pet.locator('.bubble-close').dispatchEvent('click');
    }
    await appendFile(f.file, frame([finished(4, 'error'), finished(5, 'aborted')])); await new Promise(resolve => setTimeout(resolve, 300)); await expect(pet.locator('.pet-bubble')).toBeHidden();
    await pet.evaluate(() => window.desktopPlay.hidePet()); await appendFile(f.file, frame([finished(6)]));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('view=pet'))!.showInactive());
    await new Promise(resolve => setTimeout(resolve, 2300)); await expect(pet.locator('.pet-bubble')).toBeHidden();
    await expect(pet.locator('body')).toHaveAttribute('data-count', '3');
    await appendFile(f.file, frame([finished(7)])); await expect(pet.locator('.pet-bubble')).toBeVisible();
  } finally { await app.close(); }
});

test('bubble editor preserves role/source drafts, previews actual styles, persists files and validates shared settings', async () => {
  test.setTimeout(90000); const f = await fixture(); let app = await f.launch();
  try {
    const pet = await app.firstWindow(); await pet.evaluate(() => window.desktopPlay.openSettings());
    let settings = app.windows().find(page => page !== pet) ?? await app.waitForEvent('window');
    const errors: string[] = []; settings.on('pageerror', error => errors.push(error.message));
    await settings.locator('[data-category="pet"]').click(); await settings.locator('#tab-bubbles').click();
    for (const persona of personas) {
      await settings.locator(`[data-bubble-persona="${persona}"]`).click();
      for (const source of sources) { await settings.locator('#bubble-scenario').selectOption(`completion-${source}`); await settings.locator('#bubble-copy').fill(`${persona} ${source} <b>独立文案</b>`); }
    }
    await settings.locator('[data-bubble-persona="dragon"]').click(); await settings.locator('#bubble-scenario').selectOption('completion-deepseek-harness');
    await settings.locator('#bubble-copy').fill('长文案'.repeat(66) + '完成');
    await settings.locator('#bubble-title').fill('白龙 DSH 专属提醒'); await settings.locator('#bubble-sound-enabled').check(); await settings.locator('#bubble-sound-volume').fill('0.65');
    await settings.locator('#bubble-style-override').check(); await settings.locator('#bubble-color-background').fill('#ffeedd'); await settings.locator('#bubble-color-ink').fill('#654321');
    await settings.locator('#bubble-font').selectOption('kaiti'); await settings.locator('#bubble-font-scale').fill('1.25'); await settings.locator('#bubble-opacity').fill('0.6');
    await settings.locator('#bubble-time-override').check(); await settings.locator('#bubble-profile-duration').fill('7'); await settings.locator('#bubble-profile-hover').fill('4');
    await settings.locator('#bubble-preview-placement').selectOption('below');
    await expect(settings.locator('#bubble-preview-pet .bubble-label')).toHaveText('白龙 DSH 专属提醒');
    expect(await settings.locator('#bubble-preview-pet .bubble-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(settings.locator('#bubble-preview-pet .bubble-message b')).toHaveCount(0);
    await settings.locator('#bubble-preview-pet').screenshot({ path: 'test-results/T010-preview-dragon-below.png', omitBackground: true });
    const audio = path.resolve('public/assets/completion.wav'); await app.evaluate(({ dialog }, audio) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [audio] }); }, audio);
    await settings.locator('#bubble-sound-choose').click(); await expect(settings.locator('#bubble-sound-name')).toContainText('自定义');
    await settings.locator('[data-category="reminders"]').click(); await settings.locator('#tab-completion').click();
    await expect(settings.locator('input[name="chatgptCompletionEnabled"]')).toBeChecked(); await settings.locator('input[name="chatgptCompletionEnabled"]').uncheck();
    await app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }); }, f.sessions);
    await settings.locator('#dsh-choose-directory').click(); await expect(settings.locator('#dsh-directory')).toHaveValue(f.sessions);
    await settings.locator('[data-edit-completion="deepseek-harness"]').click(); await expect(settings.locator('#bubble-title')).toHaveValue('白龙 DSH 专属提醒');
    await settings.locator('#save-settings').click(); await expect(settings.locator('#operation-status')).toContainText('设置已保存');
    const saved = await settings.evaluate(() => window.desktopPlay.getState());
    for (const persona of personas) for (const source of sources) if (!(persona === 'dragon' && source === 'deepseek-harness')) expect(saved.settings.bubbleProfilesByPersona[persona].rules[`completion-${source}`].message).toBe(`${persona} ${source} <b>独立文案</b>`);
    expect(saved.settings.bubbleProfilesByPersona.dragon.rules['completion-deepseek-harness']).toMatchObject({ soundEnabled: true, volume: .65, timing: { durationSeconds: 7, hoverDelaySeconds: 4 }, style: { fontScale: 1.25, backgroundOpacity: .6 } });
    expect(saved.activePet).toBe('deepseek'); expect(saved.settings.chatgptCompletionEnabled).toBe(false);
    await settings.screenshot({ path: 'test-results/T010-bubble-editor.png' }); expect(errors).toEqual([]);
    await app.close(); app = await f.launch(); const restarted = await app.firstWindow();
    await expect(restarted.locator('.pet-character')).toBeVisible();
    await expect.poll(() => restarted.evaluate(async () => (await window.desktopPlay.getState()).deepseekCompletion.status)).toBe('watching');
    const restored = await restarted.evaluate(() => window.desktopPlay.getState()); expect(restored.settings.bubbleProfilesByPersona).toEqual(saved.settings.bubbleProfilesByPersona); expect(restored.sounds.dragon['completion-deepseek-harness']).toMatchObject({ isCustom: true, name: 'completion.wav' });
  } finally { await app.close(); }
});

test('nine completion combinations use independent sounds, source queues, sound-only playback and hidden cancellation', async () => {
  test.setTimeout(90000); const f = await fixture(), app = await f.launch();
  try {
    const pet = await app.firstWindow(); await expect(pet.locator('.pet-character')).toBeVisible();
    await pet.evaluate(async () => {
      const profiles = (await window.desktopPlay.getState()).settings.bubbleProfilesByPersona;
      for (const [persona, profile] of Object.entries(profiles)) for (const source of ['codex', 'chatgpt-work', 'deepseek-harness'] as const) Object.assign(profile.rules[`completion-${source}`], { message: `${persona}:${source}`, soundEnabled: true, volume: .2 });
      await window.desktopPlay.updateSettings({ bubbleProfilesByPersona: profiles, soundEnabled: false });
      HTMLMediaElement.prototype.play = function () { document.body.dataset.audioCount = String(Number(document.body.dataset.audioCount ?? 0) + 1); (window as any).lastAudio = this; return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function () { document.body.dataset.pauseCount = String(Number(document.body.dataset.pauseCount ?? 0) + 1); };
    });
    const emit = (id: string, source: CompletionSource) => app.evaluate(({ BrowserWindow }, notice) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('view=pet'))!.webContents.send('desktopplay:codex-completion', { ...notice, completedAt: new Date().toISOString() }), { id, source });
    let count = 0;
    for (const persona of personas) {
      await pet.evaluate(async persona => { await window.desktopPlay.selectPet(persona === 'whale' ? 'deepseek' : 'gpt'); if (persona !== 'whale') await window.desktopPlay.selectGptAppearance(persona === 'dragon' ? 'dragon' : 'classic'); }, persona);
      for (const source of sources) await emit(`${persona}:${source}`, source);
      for (const source of sources) {
        await expect(pet.locator('.bubble-message')).toHaveText(`${persona}:${source}`); await expect(pet.locator('body')).toHaveAttribute('data-audio-count', String(++count));
        await pet.locator('.bubble-close').dispatchEvent('click');
      }
    }
    await pet.evaluate(async () => { await window.desktopPlay.selectPet('deepseek'); const profiles = (await window.desktopPlay.getState()).settings.bubbleProfilesByPersona; profiles.whale.rules['completion-codex'].enabled = false; await window.desktopPlay.updateSettings({ bubbleProfilesByPersona: profiles }); });
    await emit('sound-only', 'codex'); await expect(pet.locator('body')).toHaveAttribute('data-audio-count', '10'); await expect(pet.locator('.pet-bubble')).toBeHidden();
    await emit('queued-dsh', 'deepseek-harness'); await new Promise(resolve => setTimeout(resolve, 200)); await expect(pet.locator('.pet-bubble')).toBeHidden();
    await pet.evaluate(() => (window as any).lastAudio.dispatchEvent(new Event('ended'))); await expect(pet.locator('.bubble-message')).toHaveText('whale:deepseek-harness');
    await emit('hidden-work', 'chatgpt-work'); await pet.evaluate(() => window.desktopPlay.hidePet());
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive()); await new Promise(resolve => setTimeout(resolve, 300)); await expect(pet.locator('.pet-bubble')).toBeHidden();
    await expect(pet.locator('body')).toHaveAttribute('data-audio-count', '11');
    await pet.evaluate(() => window.desktopPlay.hidePet());
    const hiddenState = await pet.evaluate(() => window.desktopPlay.getState());
    expect(hiddenState.petVisible).toBe(false);
    hiddenState.alert = { id: 'balance-while-hidden', kind: 'low-balance', message: '隐藏期间的提醒' };
    await app.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0].webContents.send('desktopplay:state', state), hiddenState);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
    await expect(pet.locator('.pet-bubble')).toBeHidden();
    // Every displayed persona can receive balance alerts, retaining the fixed data.
    for (const persona of personas) {
      await pet.evaluate(async persona => { await window.desktopPlay.selectPet(persona === 'whale' ? 'deepseek' : 'gpt'); if (persona !== 'whale') await window.desktopPlay.selectGptAppearance(persona === 'dragon' ? 'dragon' : 'classic'); }, persona);
      const state = await pet.evaluate(() => window.desktopPlay.getState()); state.alert = { id: `balance-${persona}`, kind: 'low-balance', message: '余额低于设置的提醒金额。' };
      await app.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0].webContents.send('desktopplay:state', state), state);
      await expect(pet.locator('.bubble-label')).toHaveText('低余额提醒'); await expect(pet.locator('.bubble-message')).toContainText(state.settings.bubbleProfilesByPersona[persona].rules['low-balance'].message);
      await pet.locator('.bubble-close').dispatchEvent('click');
    }
  } finally { await app.close(); }
});
