import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { electronArgs } from './electron-args';
import { chatgptAttention } from '../fixtures/chatgpt-notification';

async function launch(hooks = false) {
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/smoke-t015-'));
  const logs = path.join(profile, 'chatgpt-test-logs'); await mkdir(logs);
  const file = path.join(logs, 'desktop.log'); await writeFile(file, chatgptAttention('question', 'startup-history', 'local'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1', DESKTOPPLAY_TEST_CHATGPT_LOG_DIR: logs, DESKTOPPLAY_TEST_CODEX_HOME: path.join(profile, 'codex-test-home'), DESKTOPPLAY_TEST_CODEX_HOOK_SUPPORTED: hooks ? '1' : '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env });
  const pet = await app.firstWindow(); await expect(pet.locator('.pet-character')).toBeVisible();
  await pet.evaluate(() => { window.desktopPlay.onConversationNotice(notice => { document.body.dataset.noticeCount = String(Number(document.body.dataset.noticeCount ?? 0) + 1); document.body.dataset.lastNotice = JSON.stringify(notice); }); return window.desktopPlay.openSettings(); });
  const settings = app.windows().find(window => window !== pet) ?? await app.waitForEvent('window');
  await settings.locator('[data-category="reminders"]').click(); await settings.locator('#tab-completion').click();
  return { app, pet, settings, profile, file };
}

test('App native local/durable attention reaches all pets, respects native suppression and independent switches', async () => {
  const { app, pet, settings, file } = await launch();
  try {
    await expect(settings.locator('#chatgpt-attention-status')).toContainText('日志已连接，等待实际提问或审批事件');
    await expect(settings.locator('#codex-attention-status')).toContainText('未接入');
    await expect(pet.locator('.pet-bubble')).toBeHidden();
    // Keep attention on while completion is off. No direct renderer event injection.
    await pet.evaluate(() => window.desktopPlay.updateSettings({ chatgptCompletionEnabled: false }));
    await expect.poll(() => pet.evaluate(async () => (await window.desktopPlay.getState()).chatgptCompletion.status)).toBe('watching');
    let count = 0;
    for (const [index, persona] of (['whale', 'gpt', 'dragon'] as const).entries()) {
      await pet.evaluate(async persona => { await window.desktopPlay.selectPet(persona === 'whale' ? 'deepseek' : 'gpt'); if (persona !== 'whale') await window.desktopPlay.selectGptAppearance(persona === 'dragon' ? 'dragon' : 'classic'); }, persona);
      await settings.bringToFront(); const focused = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id);
      for (const host of ['local', 'durable'] as const) {
        const row = chatgptAttention((['question', 'approval', 'async'] as const)[index], `request-${persona}`, host);
        await appendFile(file, row + row);
        await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'attention-chatgpt-work');
        await expect(pet.locator('.pet-bubble')).toBeVisible();
        await expect(pet.locator('body')).toHaveAttribute('data-notice-count', String(++count));
        await expect(settings.locator('#chatgpt-attention-status')).toContainText('已收到等待回应事件');
        await expect(settings.locator('#chatgpt-attention-status')).toContainText('最近事件');
        expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id)).toBe(focused);
        const notice = JSON.parse((await pet.locator('body').getAttribute('data-last-notice'))!);
        expect(Object.keys(notice).sort()).toEqual(['id', 'kind', 'occurredAt', 'source']);
        expect(JSON.stringify(notice)).not.toMatch(/fake-account|fake-user|request-/);
        await pet.locator('.bubble-message').dispatchEvent('click'); await expect(pet.locator('.pet-bubble')).toBeHidden();
      }
    }
    await appendFile(file, chatgptAttention('question', 'visible-conversation', 'local').replace('forward show', 'suppressed question') + chatgptAttention('question', 'other-conversation', 'local'));
    await expect(pet.locator('body')).toHaveAttribute('data-notice-count', String(++count));
    await expect(pet.locator('.pet-bubble')).toBeVisible();
    await pet.locator('.bubble-message').dispatchEvent('click');
    await pet.evaluate(async () => { const { settings } = await window.desktopPlay.getState(); await window.desktopPlay.updateSettings({ chatgptCompletionEnabled: true, attentionEnabledBySource: { ...settings.attentionEnabledBySource, 'chatgpt-work': false } }); });
    await expect(settings.locator('#chatgpt-attention-status')).toHaveText('ChatGPT App 等待提醒已关闭');
    await appendFile(file, chatgptAttention('question', 'disabled', 'local'));
    await pet.evaluate(async () => { const { settings } = await window.desktopPlay.getState(); await window.desktopPlay.updateSettings({ attentionEnabledBySource: { ...settings.attentionEnabledBySource, 'chatgpt-work': true } }); });
    await expect(settings.locator('#chatgpt-attention-status')).toContainText('等待实际提问或审批事件');
    await appendFile(file, chatgptAttention('question', 'enabled-again', 'local'));
    await expect(pet.locator('body')).toHaveAttribute('data-notice-count', String(++count));
    await expect(pet.locator('.pet-bubble')).toBeVisible();
    await pet.locator('.bubble-message').dispatchEvent('click');
    await pet.evaluate(() => window.desktopPlay.hidePet());
    const hiddenAt = Date.now(); await appendFile(file, chatgptAttention('approval', 'hidden', 'local', hiddenAt));
    await expect.poll(() => pet.evaluate(async () => (await window.desktopPlay.getState()).chatgptCompletion.lastAttentionAt)).toBe(new Date(hiddenAt).toISOString());
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'))!.showInactive());
    await appendFile(file, chatgptAttention('async', 'after-show', 'durable'));
    await expect(pet.locator('body')).toHaveAttribute('data-notice-count', String(++count));
    await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'attention-chatgpt-work');
    await settings.screenshot({ path: 'test-results/T015-app-attention-settings.png' });
  } finally { await app.close(); }
});

async function relay(profile: string, kind: 'question' | 'approval', client: 'Code.exe' | 'ChatGPT.exe') {
  const script = path.join(profile, 'integrations/codex/conversation-hook.ps1');
  const graph = `function Get-CimInstance { @([pscustomobject]@{ProcessId=$PID;ParentProcessId=400001;Name='powershell.exe'},[pscustomobject]@{ProcessId=400001;ParentProcessId=400002;Name='codex.exe'},[pscustomobject]@{ProcessId=400002;ParentProcessId=0;Name='${client}'}) }; `;
  const command = Buffer.from(`${graph}& '${script.replace(/'/g, "''")}'`, 'utf16le').toString('base64');
  await new Promise<void>((resolve, reject) => {
    const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', command], (error, stdout, stderr) => {
      if (error) reject(error); else if (stdout || stderr) reject(new Error('Relay must be silent')); else resolve();
    });
    child.stdin!.end(JSON.stringify({ hook_event_name: kind === 'question' ? 'PreToolUse' : 'PermissionRequest', tool_name: 'request_user_input_async', session_id: 'fake-session', turn_id: 'fake-turn', tool_use_id: `${client}-${kind}`, tool_input: { questions: ['PRIVATE BODY'] } }));
  });
}

test('hook guide saves explicit opt-in and real relay files reach bubbles without App duplicates', async () => {
  const { app, pet, settings, profile, file } = await launch(true);
  try {
    await expect(settings.locator('#codex-attention-status')).toContainText('未接入');
    await expect(settings.locator('#codex-attention-directory')).toContainText(path.join(profile, 'codex-test-home'));
    await settings.locator('input[name="codexHookEnabled"]').check();
    await expect(settings.locator('#codex-attention-draft')).toBeVisible();
    expect((await pet.evaluate(() => window.desktopPlay.getState())).settings.codexHookEnabled).toBe(false);
    await settings.locator('#save-settings').click();
    await expect(settings.locator('#codex-attention-draft')).toBeHidden();
    await expect(settings.locator('#codex-attention-status')).toContainText('等待实际事件');
    expect(JSON.parse(await readFile(path.join(profile, 'codex-test-home/hooks.json'), 'utf8')).hooks.PreToolUse).toHaveLength(1);
    await pet.clock.install();
    let count = 0;
    for (const kind of ['question', 'approval'] as const) {
      await settings.bringToFront(); const focused = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id);
      await relay(profile, kind, 'Code.exe');
      await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'attention-codex');
      await expect(pet.locator('body')).toHaveAttribute('data-notice-count', String(++count));
      await expect(settings.locator('#codex-attention-status')).toContainText('已收到等待回应事件');
      await pet.clock.fastForward(120000); await expect(pet.locator('.pet-bubble')).toBeVisible();
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id)).toBe(focused);
      await pet.locator('.bubble-message').dispatchEvent('click');
    }
    await relay(profile, 'question', 'ChatGPT.exe');
    await appendFile(file, chatgptAttention('question', 'native-app-single-source', 'local'));
    await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-scenario', 'attention-chatgpt-work');
    await expect(pet.locator('body')).toHaveAttribute('data-notice-count', String(++count));
    await settings.locator('#codex-attention-status').scrollIntoViewIfNeeded();
    await settings.screenshot({ path: 'test-results/T015-hook-connected-settings.png' });
    await settings.locator('input[name="codexHookEnabled"]').uncheck(); await settings.locator('#save-settings').click();
    await expect(settings.locator('#codex-attention-status')).toContainText('未接入');
    await expect.poll(async () => JSON.parse(await readFile(path.join(profile, 'codex-test-home/hooks.json'), 'utf8')).hooks).toEqual({});
  } finally { await app.close(); }
});
