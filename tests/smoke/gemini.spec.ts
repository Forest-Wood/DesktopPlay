import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { waitingSummary } from '../fixtures/gemini-summary';
import { spawn } from 'node:child_process';
import { electronArgs } from './electron-args';
import { settingsPage } from './settings-page';

test('Gemini skins, quota rows, Stop relay and saved profile', async ({}, info) => {
  const profile = info.outputPath('profile');
  const home = path.join(profile, 'gemini-test-home');
  await mkdir(path.join(home, 'config'), { recursive: true });
  await writeFile(path.join(home, 'config/hooks.json'), '{"existing":{"enabled":false}}');
  const quota = path.join(home, 'quota.json');
  const resetInHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
  const quotaFixture = { groups: [{ buckets: [
    { id: 'gemini-5h', remaining_fraction: .37, reset_time: resetInHours(3) },
    { id: 'gemini-argon-wtu-weekly', remaining_fraction: 0 },
    { id: 'gemini-weekly', remaining_fraction: .62, reset_time: resetInHours(80) },
  ] }] };
  const quotaLabels = ['Gemini 周额度', 'Gemini 5 小时额度'];
  const percentages = ['62%', '37%'];
  await writeFile(quota, JSON.stringify({ ...quotaFixture, planName: 'AI Pro' }));
  const env = { ...process.env, DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' };
  delete (env as NodeJS.ProcessEnv).ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env });
  let app = await launch();
  try {
    const pet = await app.firstWindow();
    await pet.evaluate(() => window.desktopPlay.openSettings());
    const settings = app.windows().find(w => w !== pet) ?? await app.waitForEvent('window');
    await settingsPage(settings, 'appearance');
    await expect(settings.locator('#select-gemini .partner-description')).toHaveText('周额度与 5 小时额度');
    await settings.locator('#select-gemini').click();
    await expect(settings.locator('#app')).toHaveClass(/gemini-theme/);
    await expect(pet.locator('.pet-canvas')).toHaveClass(/gemini-theme/);
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', /gemini-classic.png/);
    await expect(pet.locator('.pet-image')).toHaveJSProperty('naturalWidth',1254);
    await pet.screenshot({ path: path.join(profile, 'gemini-classic.png') });
    await settings.locator('#gemini-sketch').click();
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', /gemini-sketch.png/);
    await settings.screenshot({ path: path.join(profile, 'gemini-appearance.png') });
    await settingsPage(settings, 'gemini');
    await expect(settings.locator('#gemini-status-chip')).toHaveText('已连接 Antigravity');
    await expect(settings.locator('#gemini-plan')).toHaveText('AI Pro');
    const cards = settings.locator('#gemini-quotas .gemini-quota-row');
    await expect(cards.locator('span')).toHaveText(quotaLabels);
    await expect(cards.locator('strong')).toHaveText(percentages);
    await expect(cards.locator('progress')).toHaveCount(2);
    await expect(cards.locator('small')).toHaveText([/重置 /, /重置 /]);
    const setSettingsWidth = async (width: number) => {
      await app.evaluate(({ BrowserWindow }, w) =>
        BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=settings'))!.setContentSize(w, 650), width);
      await expect.poll(() => settings.evaluate(() => innerWidth)).toBe(width);
    };
    const cardRows = () => cards.evaluateAll(elements => new Set(elements.map(element => element.getBoundingClientRect().top)).size);
    await setSettingsWidth(1000);
    expect(await cardRows()).toBe(1);
    await settings.screenshot({ path: info.outputPath('gemini-settings-wide.png') });
    await setSettingsWidth(760);
    expect(await cardRows()).toBe(2);
    await settings.screenshot({ path: info.outputPath('gemini-settings-narrow.png') });
    await pet.locator('.pet-character').dispatchEvent('click');
    const rows = pet.locator('.gemini-quota-row');
    const plan = pet.locator('.gemini-plan-badge');
    await expect(plan).toHaveText('AI Pro');
    await expect(rows.locator('span')).toHaveText(quotaLabels);
    await expect(rows.locator('strong')).toHaveText(percentages);
    await expect(rows.locator('small')).toHaveText([/^重置 /, /^重置 /]);
    expect(await rows.last().evaluate(el => el.getBoundingClientRect().bottom <= el.closest('.bubble-content')!.getBoundingClientRect().bottom + 1)).toBe(true);
    await pet.screenshot({ path: info.outputPath('gemini-full.png'), omitBackground: true });
    await writeFile(quota, JSON.stringify(quotaFixture));
    await pet.evaluate(() => window.desktopPlay.refreshGeminiQuota());
    await expect(plan).toBeHidden();
    await expect(settings.locator('#gemini-plan')).toBeHidden();
    await pet.evaluate(() => window.desktopPlay.updateSettings({petMode:'simple'}));
    await expect(rows.locator('span')).toHaveText(quotaLabels);
    await expect(rows.locator('strong')).toHaveText(percentages);
    await expect(rows.locator('small')).toHaveCount(0);
    expect(await rows.last().evaluate(el => el.getBoundingClientRect().bottom <= el.closest('.bubble-content')!.getBoundingClientRect().bottom + 1)).toBe(true);
    await pet.screenshot({ path: info.outputPath('gemini-simple.png'), omitBackground: true });
    await pet.evaluate(() => { window.desktopPlay.onConversationNotice(n => { if (n.source === 'antigravity') document.body.dataset.geminiNotices = String(Number(document.body.dataset.geminiNotices ?? 0) + 1); }); });
    const summaryDir = path.join(home, 'antigravity');
    await mkdir(summaryDir, { recursive: true });
    const db = new DatabaseSync(path.join(summaryDir, 'conversation_summaries.db'));
    try {
      db.exec(`CREATE TABLE conversation_summaries (conversation_id TEXT PRIMARY KEY,
        step_count INTEGER NOT NULL DEFAULT 0, last_modified_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT '', parent_conversation_id TEXT NOT NULL DEFAULT '',
        nesting_depth INTEGER NOT NULL DEFAULT 0, not_fully_idle NUMERIC NOT NULL DEFAULT 0,
        killed NUMERIC NOT NULL DEFAULT 0, last_user_input_time TEXT NOT NULL DEFAULT '',
        last_user_input_step_index INTEGER NOT NULL DEFAULT -1, raw_summary BLOB)`);
      const upsert = db.prepare('INSERT OR REPLACE INTO conversation_summaries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const now = new Date(Date.now() + 200).toISOString();
      // Default config (geminiHookEnabled=false): App/VS Code completion via conversation_summaries.db shows bubble.
      upsert.run('db-complete', 4, now, 'CASCADE_RUN_STATUS_IDLE', '', 0, 0, 0, now, -1, null);
      await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'completion-antigravity');
      await expect(pet.locator('.bubble-source')).toHaveText('Gemini');
      await pet.screenshot({ path: info.outputPath('gemini-completion.png'), omitBackground: true });
      await expect(pet.locator('body')).toHaveAttribute('data-gemini-notices', '1');
      await pet.locator('.bubble-message').dispatchEvent('click');
      await pet.evaluate(() => window.desktopPlay.updateSettings({ geminiHookEnabled: true }));
      const script = path.join(profile, 'integrations/gemini/stop.ps1');
      const relay = (client: string, reason = 'NO_TOOL_CALL', extra: Record<string, unknown> = {}) => new Promise<void>((resolve, reject) => {
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
        child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(Error('relay failed')));
        const payload: Record<string, unknown> = { conversationId: 'test-' + client, transcriptPath: path.join(home, client, 'brain', 'test-' + client, '.system_generated/logs/transcript.jsonl'), fullyIdle: true, terminationReason: reason, ...extra };
        child.stdin.end(JSON.stringify(payload));
      });
      await pet.evaluate(() => window.desktopPlay.selectPet('deepseek'));
      for (const client of ['antigravity', 'antigravity-ide', 'antigravity-cli']) {
        await relay(client, 'ERROR', { executionNum: 2 }); await relay(client, 'USER_CANCELED', { executionNum: 3 });
        await relay(client, 'NO_TOOL_CALL', { parentConversationId: 'parent', executionNum: 4 });
        await relay(client, 'NO_TOOL_CALL', { fullyIdle: false, executionNum: 5 });
        await relay(client); await relay(client);
      }
      await expect(pet.locator('body')).toHaveAttribute('data-gemini-notices', '4');
      await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'completion-antigravity');
      const waitTime = new Date(Date.now() + 200).toISOString();
      upsert.run('pending', 3, waitTime, 'CASCADE_RUN_STATUS_IDLE', '', 0, 1, 0, waitTime, 1, waitingSummary(22, 1));
      await expect(pet.locator('.bubble-message')).toContainText('Gemini 有问题等你回答');
      await pet.locator('.bubble-message').dispatchEvent('click');
      upsert.run('pending', 4, new Date(Date.now() + 400).toISOString(), 'CASCADE_RUN_STATUS_IDLE', '', 0, 1, 0, waitTime, 1, waitingSummary(21, 2));
      await expect(pet.locator('.bubble-message')).toContainText('Gemini 有操作等你批准');
    } finally { db.close(); }
    await pet.evaluate(() => window.desktopPlay.selectPet('gemini'));
    await app.close(); app = await launch();
    const restored = await app.firstWindow();
    await expect(restored.locator('.pet-image')).toHaveAttribute('src', /gemini-sketch.png/);
    await expect(restored.locator('.pet-bubble')).toBeHidden();
    await restored.evaluate(() => window.desktopPlay.updateSettings({geminiHookEnabled:false}));
    expect(JSON.parse(await readFile(path.join(home,'config/hooks.json'),'utf8'))).toEqual({existing:{enabled:false}});
  } finally { await app.close(); }
});
