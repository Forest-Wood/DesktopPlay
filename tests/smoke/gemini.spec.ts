import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { waitingSummary, SUMMARY_TABLE } from '../fixtures/gemini-summary';
import { spawn } from 'node:child_process';
import { electronArgs } from './electron-args';

test('Gemini skins, quota rows, Stop relay and saved profile', async () => {
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/T024-smoke-'));
  const home = path.join(profile, 'gemini-test-home');
  await mkdir(path.join(home, 'config'), { recursive: true });
  await writeFile(path.join(home, 'config/hooks.json'), '{"existing":{"enabled":false}}');
  const quota = path.join(home, 'quota.json');
  await writeFile(quota, JSON.stringify({ groups: [{ buckets: [
    { id: 'gemini-5h', remaining_fraction: .37 }, { id: 'gemini-argon-wtu-weekly', remaining_fraction: 0 },
    { id: 'gemini-weekly', remaining_fraction: .62 },
  ] }] }));
  const env = { ...process.env, DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' };
  delete (env as NodeJS.ProcessEnv).ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env });
  let app = await launch();
  try {
    const pet = await app.firstWindow();
    await pet.evaluate(() => window.desktopPlay.openSettings());
    const settings = app.windows().find(w => w !== pet) ?? await app.waitForEvent('window');
    await settings.locator('[data-category="pet"]').click();
    await settings.locator('#select-gemini').click();
    await expect(settings.locator('#app')).toHaveClass(/gemini-theme/);
    await expect(pet.locator('.pet-canvas')).toHaveClass(/gemini-theme/);
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', /gemini-classic.png/);
    await expect(pet.locator('.pet-image')).toHaveJSProperty('naturalWidth',1254);
    await pet.screenshot({ path: path.join(profile, 'gemini-classic.png') });
    await settings.locator('#gemini-sketch').click();
    await expect(pet.locator('.pet-image')).toHaveAttribute('src', /gemini-sketch.png/);
    await settings.screenshot({ path: path.join(profile, 'gemini-appearance.png') });
    await settings.locator('[data-category="account"]').click(); await settings.locator('#tab-gemini').click();
    await expect(settings.locator('#gemini-status-chip')).toHaveText('已连接 Antigravity');
    await expect(settings.locator('#gemini-quotas strong')).toHaveText(['0%', '62%', '37%']);
    await expect(settings.locator('#gemini-quotas progress')).toHaveCount(3);
    await settings.screenshot({ path: path.join(profile, 'gemini-settings.png') });
    await pet.locator('.pet-character').dispatchEvent('click');
    const rows = pet.locator('.gemini-quota-row');
    expect(await rows.last().evaluate(el => el.getBoundingClientRect().bottom <= el.closest('.bubble-content')!.getBoundingClientRect().bottom + 1)).toBe(true);
    await pet.screenshot({ path: path.join(profile, 'gemini-full.png') });
    await pet.evaluate(() => window.desktopPlay.updateSettings({petMode:'simple'}));
    await expect(rows.locator('span')).toHaveText(['Argon 周额度', 'Gemini 周额度', 'Gemini 5 小时额度']);
    await expect(rows.locator('strong')).toHaveText(['0%', '62%', '37%']);
    expect(await rows.last().evaluate(el => el.getBoundingClientRect().bottom <= el.closest('.bubble-content')!.getBoundingClientRect().bottom + 1)).toBe(true);
    await pet.screenshot({ path: path.join(profile, 'gemini-simple.png') });
    await pet.evaluate(() => window.desktopPlay.updateSettings({geminiHookEnabled:true}));
    const script = path.join(profile, 'integrations/gemini/stop.ps1');
    await pet.evaluate(() => { window.desktopPlay.onConversationNotice(n => { if (n.source === 'antigravity') document.body.dataset.geminiNotices = String(Number(document.body.dataset.geminiNotices ?? 0) + 1); }); });
    const relay = (client: string, reason = 'model_stop', extra: Record<string, unknown> = {}) => new Promise<void>((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script], { windowsHide:true, stdio:['pipe','ignore','ignore'] });
      child.on('error',reject); child.on('close',code => code === 0 ? resolve() : reject(Error('relay failed')));
      child.stdin.end(JSON.stringify({conversationId:'test-' + client, transcriptPath: path.join(home,client,'brain','test-' + client,'.system_generated/logs/transcript.jsonl'), executionNum:1, fullyIdle:true, terminationReason:reason, ...extra}));
    });
    await pet.evaluate(() => window.desktopPlay.selectPet('deepseek'));
    for (const client of ['antigravity','antigravity-ide','antigravity-cli']) {
      await relay(client, 'error', {executionNum:2}); await relay(client, 'cancelled', {executionNum:3});
      await relay(client, 'model_stop', { parentConversationId:'parent', executionNum:4 });
      await relay(client, 'model_stop', { fullyIdle:false, executionNum:5 });
      await relay(client); await relay(client);
    }
    await expect(pet.locator('body')).toHaveAttribute('data-gemini-notices','3');
    await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario','completion-antigravity');
    const summaryDir = path.join(home, 'antigravity');
    await mkdir(summaryDir, {recursive:true});
    const db = new DatabaseSync(path.join(summaryDir, 'conversation_summaries.db'));
    try {
      db.exec(SUMMARY_TABLE);
      const insert = db.prepare('INSERT OR REPLACE INTO conversation_summaries VALUES (?,1,NULL,?,NULL,0,?)');
      insert.run('pending', new Date().toISOString(), waitingSummary(22,1));
      await expect(pet.locator('.bubble-message')).toContainText('Gemini 有问题等你回答');
      await pet.locator('.bubble-message').dispatchEvent('click');
      insert.run('pending', new Date().toISOString(), waitingSummary(21,2));
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
