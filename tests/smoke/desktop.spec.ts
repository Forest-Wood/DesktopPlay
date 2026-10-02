import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import electronPath from 'electron';
import path from 'node:path';
import { mkdir, mkdtemp } from 'node:fs/promises';

test('packaged renderer, secure bridge and persistent desktop settings', async () => {
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(path.resolve('.tmp/smoke-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), DESKTOPPLAY_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({ executablePath: electronPath as unknown as string, args: ['.'], cwd: process.cwd(), env });
    await expect.poll(() => application!.windows().length).toBe(2);
    const settings = application.windows().find(page => page.url().includes('view=settings'))!;
    const pet = application.windows().find(page => page.url().includes('view=pet'))!;
    const errors: string[] = [];
    for (const page of [settings, pet]) page.on('pageerror', error => errors.push(error.message));
    await expect(settings.getByRole('heading', { name: '小鲸鱼的栖息地' })).toBeVisible();
    await expect(settings.locator('#network-status')).toHaveText('尚未连接');
    await expect(pet.locator('.pet-image')).toBeVisible();
    expect(await settings.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined');
    expect(await settings.evaluate(() => window.desktopPlay.getState())).toMatchObject({ hasApiKey: false, status: 'unconfigured' });
    await settings.locator('#scale').fill('1.25');
    await settings.locator('input[name="soundEnabled"]').uncheck();
    await settings.locator('#low-balance').fill('10.12345678');
    await settings.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(settings.locator('#operation-status')).toContainText('设置已保存');
    await expect.poll(async () => (await settings.evaluate(() => window.desktopPlay.getState())).settings.scale).toBe(1.25);
    const windows = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => ({ title: w.getTitle(), bounds: w.getBounds(), alwaysOnTop: w.isAlwaysOnTop() })));
    const petWindow = windows.find(w => w.bounds.width === 450);
    expect(petWindow?.bounds.height).toBe(550);
    expect(petWindow?.alwaysOnTop).toBe(true);
    expect(await settings.evaluate(async () => { try { await window.desktopPlay.updateSettings({ scale: 900 }); return false; } catch { return true; } })).toBe(true);
    expect(await settings.evaluate(async () => { try { await window.desktopPlay.setApiKey('  '); return false; } catch { return true; } })).toBe(true);

    const imported = path.resolve('public/assets/whale.png');
    await application.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, imported);
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
    await application.close(); application = undefined;

    application = await electron.launch({ executablePath: electronPath as unknown as string, args: ['.'], cwd: process.cwd(), env });
    await expect.poll(() => application!.windows().length).toBe(2);
    const restarted = application.windows().find(page => page.url().includes('view=settings'))!;
    await expect(restarted.locator('#network-status')).toBeVisible();
    expect((await restarted.evaluate(() => window.desktopPlay.getState())).settings).toMatchObject({ scale: 1.25, soundEnabled: false, lowBalanceThreshold: '10.12345678' });
  } finally { await application?.close(); }
});
