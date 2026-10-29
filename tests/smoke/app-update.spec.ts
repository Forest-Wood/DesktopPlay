import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { electronArgs } from './electron-args';

test('version routing, safe development mode, typed IPC, progress/cancel, drafts and update bubble priority', async () => {
  await mkdir('.tmp', { recursive: true }); const profile = await mkdtemp(path.resolve('.tmp/smoke-update-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((v): v is [string, string] => typeof v[1] === 'string')), DESKTOPPLAY_USER_DATA: profile, DESKTOPPLAY_TEST_NO_CODEX: '1', DESKTOPPLAY_TEST_NO_ONBOARDING: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({ executablePath: electronPath as unknown as string, args: electronArgs, env });
  try {
    const pet = await application.firstWindow(); await expect(pet.locator('.pet-character')).toBeVisible();
    await expect(pet.evaluate(() => window.desktopPlay.checkForUpdates())).rejects.toThrow();
    await pet.evaluate(() => window.desktopPlay.openSettings('version'));
    const settings = application.windows().find(p => p !== pet) ?? await application.waitForEvent('window');
    await expect(settings.locator('#version')).toBeVisible(); await expect(settings.locator('#update-check')).toBeDisabled(); await expect(settings.locator('#update-error')).toContainText('不执行');
    expect(await settings.evaluate(async () => (await window.desktopPlay.installUpdate()).started).catch(() => false)).toBe(false);
    // A trusted harness changes only this isolated process's IPC handlers; production has no update bypass.
    await application.evaluate(({ ipcMain, BrowserWindow }) => {
      const page = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=settings'))!;
      const handlers = (ipcMain as any)._invokeHandlers as Map<string, Function>;
      (globalThis as any).updateFixture = { original: handlers.get('desktopplay:get-state'), page, installs: 0, patch: { kind: 'portable', status: 'available', latestVersion: '0.5.4', releaseNotes: '<b>纯文本更新说明</b>', error: null } };
      const f = (globalThis as any).updateFixture;
      const state = async (event: unknown) => ({ ...await f.original(event), appUpdate: { ...(await f.original(event)).appUpdate, ...f.patch } });
      const emit = async (event: unknown) => { const next = await state(event); page.webContents.send('desktopplay:state', next); return next.appUpdate; };
      for (const [name, action] of Object.entries({ 'check-update': async (e: unknown) => emit(e), 'download-update': async (e: unknown) => { f.patch.status = 'downloading'; f.patch.progress = 50; f.patch.total = 2000000; f.patch.transferred = 1000000; return emit(e); }, 'cancel-update': async (e: unknown) => { f.patch.status = 'available'; return emit(e); }, 'install-update': async () => { f.installs++; return { started: true }; } })) { ipcMain.removeHandler(`desktopplay:${name}`); ipcMain.handle(`desktopplay:${name}`, action); }
    });
    await settings.evaluate(() => window.desktopPlay.checkForUpdates()); await expect(settings.locator('#update-status')).toContainText('0.5.4');
    await expect(settings.locator('#update-notes')).toHaveText('<b>纯文本更新说明</b>'); expect(await settings.locator('#update-notes b').count()).toBe(0);
    await expect(settings.locator('#update-notes-title')).toHaveText('更新公告');
    await expect(settings.locator('#update-notes-version')).toContainText('0.5.4');
    const setAnnouncement = async (patch: Record<string, unknown>) => {
      await application.evaluate((_electron, patch) => { Object.assign((globalThis as any).updateFixture.patch, patch); }, patch);
      await settings.evaluate(() => window.desktopPlay.checkForUpdates());
    };
    await setAnnouncement({ releaseNotes: '  ' });
    await expect(settings.locator('#update-notes')).toHaveText('本版本未提供更新公告。');
    await setAnnouncement({ releaseNotes: '- 改进所有桌宠的更新公告展示。\n'.repeat(100), latestVersion: '1.0.0', releaseDate: '2026-10-22T00:00:00Z' });
    await expect(settings.locator('#update-notes-version')).toContainText('1.0.0');
    expect(await settings.locator('#update-notes').evaluate(el => el.scrollHeight > el.clientHeight && el.scrollWidth <= el.clientWidth)).toBe(true);
    await settings.locator('#update-download').scrollIntoViewIfNeeded(); await expect(settings.locator('#update-download')).toBeVisible();
    await settings.locator('#update-announcement').screenshot({ path: 'test-results/T012-update-announcement.png' });
    await setAnnouncement({ status: 'error', latestVersion: null, releaseNotes: '旧公告不应可见', error: '网络不可用' });
    await expect(settings.locator('#update-announcement')).toBeHidden();
    await setAnnouncement({ status: 'available', latestVersion: '0.5.4', releaseNotes: '- 完善公告。\n- 修复显示。\n- 保留设置。', error: null });
    await settings.locator('#auto-check-updates').uncheck();
    await settings.locator('#update-download').click(); await expect(settings.locator('#update-progress')).toHaveAttribute('value', '50'); await settings.locator('#update-cancel').click();
    await application.evaluate(() => { (globalThis as any).updateFixture.patch.status = 'ready'; }); await settings.evaluate(() => window.desktopPlay.checkForUpdates());
    await settings.locator('#update-install').click(); await expect(settings.locator('#update-dirty-dialog')).toBeVisible();
    expect(await application.evaluate(() => (globalThis as any).updateFixture.installs)).toBe(0);
    await settings.locator('#update-keep-editing').click(); await expect(settings.locator('#auto-check-updates')).not.toBeChecked();
    await settings.locator('#save-settings').click(); await expect.poll(() => settings.evaluate(async () => (await window.desktopPlay.getState()).settings.autoCheckUpdates)).toBe(false);
    await settings.evaluate(() => window.desktopPlay.checkForUpdates()); await settings.locator('#update-install').click();
    await expect.poll(() => application.evaluate(() => (globalThis as any).updateFixture.installs)).toBe(1);
    await settings.bringToFront(); const focus = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id);
    const emit = async (channel: string, value: unknown) => application.evaluate(({ BrowserWindow }, { channel, value }) => { BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))!.webContents.send(`desktopplay:${channel}`, value); }, { channel, value });
    await emit('conversation-notice', { id: 'fixture-complete', source: 'codex', kind: 'completion', occurredAt: new Date().toISOString() }); await expect(pet.locator('.bubble-label')).toHaveText('Codex 完成提醒');
    await emit('update-available', { version: '0.5.4' }); await expect(pet.locator('.bubble-label')).toHaveText('Codex 完成提醒');
    await pet.locator('.bubble-close').evaluate((node: HTMLElement) => node.click()); await expect(pet.locator('.bubble-label')).toHaveText('软件更新');
    expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id)).toBe(focus);
    await pet.screenshot({ path: 'test-results/update-bubble.png', omitBackground: true });
    await pet.locator('.bubble-update').evaluate((node: HTMLElement) => node.click()); await expect(settings.locator('#version')).toBeVisible();
    await emit('update-available', { version: '0.5.4' }); await expect(pet.locator('.pet-bubble')).toBeHidden();
    // A queued notice is dropped on hiding, including when another notice is visible.
    await emit('conversation-notice', { id: 'fixture-two', source: 'codex', kind: 'completion', occurredAt: new Date().toISOString() }); await expect(pet.locator('.pet-bubble')).toBeVisible();
    await emit('update-available', { version: '0.5.5' }); await pet.evaluate(() => window.desktopPlay.hidePet());
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))!.showInactive());
    await expect(pet.locator('.pet-bubble')).toBeHidden();
    const now = Date.now(); await pet.clock.install({ time: now }); await pet.clock.pauseAt(now + 1000);
    await pet.locator('.pet-character').dispatchEvent('click', { detail: 0 }); await pet.locator('.bubble-switch').dispatchEvent('click');
    await emit('update-available', { version: '0.5.6' }); await pet.clock.runFor(5000); await expect(pet.locator('.bubble-confirm')).toBeVisible();
    await pet.locator('.bubble-cancel').dispatchEvent('click'); await pet.clock.runFor(3000); await expect(pet.locator('.bubble-label')).toHaveText('软件更新');
    await pet.evaluate(() => window.desktopPlay.updateSettings({ bubbleDurationSeconds: 2, bubbleHoverDelaySeconds: 1 }));
    await pet.locator('.pet-bubble').dispatchEvent('pointerenter'); await pet.clock.runFor(9000); await expect(pet.locator('.pet-bubble')).toBeVisible();
    await pet.locator('.pet-bubble').dispatchEvent('pointerleave'); await pet.clock.runFor(999); await expect(pet.locator('.pet-bubble')).toBeVisible();
    await pet.clock.runFor(1); await expect(pet.locator('.pet-bubble')).toBeHidden();
    const box = (await pet.locator('.pet-character').boundingBox())!;
    await pet.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await pet.mouse.down();
    await emit('update-available', { version: '0.5.7' }); await emit('update-available', { version: '0.5.8' }); await expect(pet.locator('.pet-bubble')).toBeHidden();
    await pet.mouse.up(); await pet.clock.runFor(2000); await expect(pet.locator('.bubble-message')).toContainText('0.5.8');
    await settings.evaluate(() => window.desktopPlay.checkForUpdates()); await settings.locator('#update-install').scrollIntoViewIfNeeded();
    await settings.screenshot({ path: 'test-results/update-settings.png' });
  } finally { await application.close(); }
});
