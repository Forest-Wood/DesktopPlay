import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, safeStorage, screen, shell, Tray } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { DesktopService } from './services/desktop-service';
import { CodexQuotaService } from './services/codex-quota';
import { PetAssets } from './pet-assets';
import { characterOrigin, fitScale, petSize, placeCharacter } from './geometry';
import type { Orientation, Point } from './geometry';
import { contains, getPetLayout, PET_WIDTH } from '../shared/pet-layout';
import type { AppState, AppSettings, BuiltinPetId, GptAppearance, BubblePlacement } from '../shared/types';

app.setName('DesktopPlay');
// Isolated profiles are supported only by development/test builds.
if (!app.isPackaged && process.env.DESKTOPPLAY_USER_DATA) app.setPath('userData', path.resolve(process.env.DESKTOPPLAY_USER_DATA));
else app.setPath('userData', path.join(app.getPath('appData'), 'DesktopPlay'));
const dataDir = app.getPath('userData');
const devUrl = !app.isPackaged ? process.env.DESKTOPPLAY_DEV_URL : undefined;
const rendererFile = path.join(__dirname, '../dist/index.html');
let petWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let service: DesktopService;
let assets: PetAssets;
let codex: CodexQuotaService;
let codexTimer: ReturnType<typeof setInterval> | null = null;
let flipped = false, bubbleVisible = false, quitting = false;
let verticalFlipped = false;
let bubblePlacement: BubblePlacement = 'above';
let windowSaveTimer: ReturnType<typeof setTimeout> | null = null;
let dragTimer: ReturnType<typeof setInterval> | null = null;
let hitTimer: ReturnType<typeof setInterval> | null = null;
let dragStart: { mouse: Electron.Point; character: Point; moved: boolean } | null = null;
let geometryWrites = Promise.resolve();
const profileFile = path.join(dataDir, 'window.json');
let lastSettings: AppSettings | null = null;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { showPet(); if (settingsWindow) settingsWindow.focus(); });
  app.whenReady().then(start).catch(() => { dialog.showErrorBox('DesktopPlay 启动失败', '无法初始化本地数据，请检查应用数据目录的访问权限后重试。'); app.quit(); });
}
app.on('window-all-closed', () => { /* The tray keeps the desktop pet alive. */ });
app.on('before-quit', () => {
  quitting = true; service?.dispose(); codex?.dispose();
  if (codexTimer) clearInterval(codexTimer);
  if (dragTimer) clearInterval(dragTimer);
  if (hitTimer) clearInterval(hitTimer);
  if (windowSaveTimer) clearTimeout(windowSaveTimer);
  tray?.destroy();
});

function orientation(): Orientation { return { flipped, verticalFlipped, bubblePlacement }; }
function getState(): AppState { return { ...service.getState(), pet: assets.get(), activePet: assets.getSelected(), gptAppearance: assets.getGptAppearance(), hasCustomGpt: assets.hasCustomGpt(), codex: codex.getState(), ...orientation(), effectiveScale: petWindow && !petWindow.isDestroyed() ? petWindow.getBounds().width / PET_WIDTH : service.getState().settings.scale }; }
function publish(): void {
  const state = getState();
  for (const win of [petWindow, settingsWindow]) if (win && !win.isDestroyed() && !win.webContents.isLoadingMainFrame()) win.webContents.send('desktopplay:state', state);
}

async function start(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  assets = new PetAssets(dataDir); await assets.init();
  service = new DesktopService({ dataDir, secrets: safeStorage });
  await service.init();
  let executablePath: string | undefined;
  try {
    const preference = JSON.parse(await readFile(path.join(dataDir, 'codex-executable.json'), 'utf8'));
    if (typeof preference.executablePath === 'string') executablePath = preference.executablePath;
  } catch { /* Default to native Codex discovery. */ }
  const noCodex = !app.isPackaged && process.env.DESKTOPPLAY_TEST_NO_CODEX === '1';
  codex = new CodexQuotaService({ cwd: dataDir, ...(noCodex ? { discoverExecutable: async () => null } : { executablePath }) });
  await codex.init();
  codex.subscribe(publish);
  service.subscribe(() => { applySettings(); publish(); });
  registerIpc();
  await createPet();
  createTray();
  applySettings();
  codexTimer = setInterval(() => { if (assets.getSelected() === 'gpt' || settingsWindow?.isVisible()) void codex.refresh(); }, 60000);
  if (assets.getSelected() === 'gpt') void codex.refresh();
  screen.on('display-added', restoreToScreen);
  screen.on('display-removed', restoreToScreen);
  screen.on('display-metrics-changed', restoreToScreen);
  if (!service.getState().hasApiKey && !process.env.DESKTOPPLAY_TEST_NO_ONBOARDING) await openSettings();
  hitTimer = setInterval(updateHitRegion, 80);
}

function securedWindow(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({ ...options, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged, spellcheck: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.webContents.on('did-finish-load', publish);
  return win;
}

async function loadWindow(win: BrowserWindow, view: string): Promise<void> {
  if (devUrl) await win.loadURL(`${devUrl}/?view=${view}`);
  else await win.loadFile(rendererFile, { query: { view } });
}

async function createPet(): Promise<void> {
  const area = screen.getPrimaryDisplay().workArea, size = petSize(fitScale(service.getState().settings.scale, area));
  let bounds = { ...size, x: area.x + area.width - size.width - 16, y: area.y + area.height - size.height - 8 };
  let savedCharacter: Point | null = null;
  try {
    const saved = JSON.parse(await readFile(profileFile, 'utf8'));
    const validPoint = (point: any) => Number.isFinite(point?.x) && Number.isFinite(point?.y) && Math.abs(point.x) < 100000 && Math.abs(point.y) < 100000;
    if (saved.version === 2 && validPoint(saved.character)) {
      savedCharacter = saved.character; flipped = saved.flipped === true;
      verticalFlipped = saved.verticalFlipped === true; bubblePlacement = saved.bubblePlacement === 'below' ? 'below' : 'above';
    }
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y) && Math.abs(saved.x) < 100000 && Math.abs(saved.y) < 100000) {
      bounds = { ...bounds, x: Math.round(saved.x), y: Math.round(saved.y) }; flipped = saved.flipped === true;
    }
  } catch { /* First launch uses the lower right corner. */ }
  const anchor = savedCharacter ?? characterOrigin(bounds, orientation());
  const selectedArea = screen.getDisplayNearestPoint({ x: Math.round(anchor.x + 110 * size.width / PET_WIDTH), y: Math.round(anchor.y + 110 * size.width / PET_WIDTH) }).workArea;
  const placed = placeCharacter(anchor, selectedArea, service.getState().settings.scale, orientation(), false);
  bounds = placed.bounds; flipped = placed.flipped; verticalFlipped = placed.verticalFlipped; bubblePlacement = placed.bubblePlacement;
  petWindow = securedWindow({ ...bounds, frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: service.getState().settings.alwaysOnTop, show: false, backgroundColor: '#00000000', title: 'DesktopPlay · 小鲸鱼' });
  petWindow.on('close', (event) => { if (!quitting) { event.preventDefault(); petWindow?.hide(); } });
  petWindow.on('move', scheduleWindowSave);
  petWindow.on('blur', finishDrag);
  let recoveries = 0;
  petWindow.webContents.on('render-process-gone', () => { if (!quitting && recoveries++ < 2) petWindow?.reload(); });
  await loadWindow(petWindow, 'pet');
  petWindow.showInactive();
}

async function openSettings(): Promise<void> {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  const area = screen.getPrimaryDisplay().workArea;
  settingsWindow = securedWindow({ width: Math.min(1060, area.width), height: Math.min(800, area.height), minWidth: Math.min(760, area.width), minHeight: Math.min(560, area.height), show: false, autoHideMenuBar: true, backgroundColor: '#f5f7f9', title: 'DesktopPlay · 设置', icon: path.join(__dirname, '../dist/assets/whale.png') });
  settingsWindow.on('closed', () => { settingsWindow = null; });
  await loadWindow(settingsWindow, 'settings');
  settingsWindow.show();
}

function showPet(): void { petWindow?.showInactive(); restoreToScreen(); }
async function selectPet(id: BuiltinPetId): Promise<void> {
  await assets.select(id); updateTray(); publish();
  if (id === 'gpt') void codex.refresh();
}
async function selectGptAppearance(id: GptAppearance): Promise<void> {
  await assets.selectGptAppearance(id); updateTray(); publish();
}
function refreshCurrent(): void { if (assets.getSelected() === 'gpt') void codex.refresh(); else void service.refresh(); }
function petMenu(): Electron.MenuItemConstructorOptions[] {
  return [
    { label: 'DeepSeek · 小鲸鱼', type: 'radio', checked: assets.getSelected() === 'deepseek', click: () => { void selectPet('deepseek').catch(() => {}); } },
    { label: 'GPT · Codex 小伙伴', type: 'radio', checked: assets.getSelected() === 'gpt', click: () => { void selectPet('gpt').catch(() => {}); } },
  ];
}
function appearanceMenu(): Electron.MenuItemConstructorOptions[] {
  return ([['classic', 'GPT · 原版'], ['dragon', 'GPT · 白龙'], ...(assets.hasCustomGpt() ? [['custom', 'GPT · 自定义']] : [])] as [GptAppearance, string][]).map(([id, label]) => ({ label, type: 'radio', checked: assets.getGptAppearance() === id, click: () => { void selectGptAppearance(id).catch(() => {}); } }));
}
function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../dist/assets/whale.png')).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.on('double-click', showPet); updateTray();
}
function updateTray(): void {
  if (tray) {
    tray.setToolTip(`DesktopPlay · ${assets.get().name}`);
    tray.setImage(nativeImage.createFromPath(path.join(__dirname, `../dist/assets/${assets.getSelected() === 'gpt' ? assets.getGptAppearance() === 'dragon' ? 'gpt-dragon-v2' : 'gpt' : 'whale'}.png`)).resize({ width: 32, height: 32 }));
  }
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: '显示桌宠', click: showPet },
    { label: '切换桌宠', submenu: petMenu() },
    { label: 'GPT 造型', submenu: appearanceMenu() },
    { label: '设置、余额与额度', click: () => { void openSettings(); } },
    { label: '刷新当前额度', click: refreshCurrent },
    { type: 'separator' },
    { label: '总在最前', type: 'checkbox', checked: service.getState().settings.alwaysOnTop, click: () => { void service.updateSettings({ alwaysOnTop: !service.getState().settings.alwaysOnTop }).catch(() => {}); } },
    { label: '隐藏桌宠', click: () => petWindow?.hide() },
    { type: 'separator' }, { label: '退出 DesktopPlay', click: () => app.quit() },
  ]));
}
function applySettings(): void {
  const settings = service.getState().settings;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setAlwaysOnTop(settings.alwaysOnTop);
    if (!lastSettings || settings.scale !== lastSettings.scale) {
      positionPet(characterOrigin(petWindow.getBounds(), orientation()), false);
    }
  }
  if (app.isPackaged && (!lastSettings || lastSettings.launchAtLogin !== settings.launchAtLogin)) {
    const executable = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, path: executable, args: [] });
  }
  lastSettings = { ...settings, phrases: [...settings.phrases] }; updateTray();
}

function scheduleWindowSave(): void {
  if (windowSaveTimer) clearTimeout(windowSaveTimer);
  windowSaveTimer = setTimeout(() => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const saved = JSON.stringify({ version: 2, character: characterOrigin(petWindow.getBounds(), orientation()), ...orientation() });
    geometryWrites = geometryWrites.then(async () => { await writeFile(`${profileFile}.tmp`, saved); await rename(`${profileFile}.tmp`, profileFile); }).catch(() => {});
  }, 200);
}
function restoreToScreen(): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  positionPet(characterOrigin(petWindow.getBounds(), orientation()), false); publish();
}
function positionPet(anchor: Point, snap: boolean): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  const old = petWindow.getBounds(), scale = old.width / PET_WIDTH;
  const area = screen.getDisplayNearestPoint({ x: Math.round(anchor.x + 110 * scale), y: Math.round(anchor.y + 110 * scale) }).workArea;
  const next = placeCharacter(anchor, area, service.getState().settings.scale, orientation(), snap);
  const changed = flipped !== next.flipped || verticalFlipped !== next.verticalFlipped || bubblePlacement !== next.bubblePlacement || old.width !== next.bounds.width;
  flipped = next.flipped; verticalFlipped = next.verticalFlipped; bubblePlacement = next.bubblePlacement;
  petWindow.setBounds(next.bounds); scheduleWindowSave();
  if (changed) publish();
}
function beginDrag(): void {
  if (!petWindow || dragStart) return;
  petWindow.setIgnoreMouseEvents(false);
  dragStart = { mouse: screen.getCursorScreenPoint(), character: characterOrigin(petWindow.getBounds(), orientation()), moved: false };
  dragTimer = setInterval(() => {
    if (!dragStart || !petWindow) return;
    const cursor = screen.getCursorScreenPoint();
    if (Math.hypot(cursor.x - dragStart.mouse.x, cursor.y - dragStart.mouse.y) < 5) return;
    dragStart.moved = true;
    positionPet({ x: dragStart.character.x + cursor.x - dragStart.mouse.x, y: dragStart.character.y + cursor.y - dragStart.mouse.y }, false);
  }, 16);
}
function finishDrag(): void {
  if (dragTimer) clearInterval(dragTimer); dragTimer = null;
  if (!dragStart || !petWindow) return;
  const moved = dragStart.moved; dragStart = null;
  if (moved) positionPet(characterOrigin(petWindow.getBounds(), orientation()), service.getState().settings.snapToEdges);
  updateHitRegion();
}
function updateHitRegion(): void {
  if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible() || dragStart) return;
  const p = screen.getCursorScreenPoint(), b = petWindow.getBounds(), s = b.width / PET_WIDTH;
  const x = (p.x - b.x) / s, y = (p.y - b.y) / s;
  const layout = getPetLayout(flipped, bubblePlacement);
  const inPet = contains(layout.character, x, y);
  const inBubble = bubbleVisible && contains(layout.bubbleHit, x, y);
  petWindow.setIgnoreMouseEvents(!(inPet || inBubble), { forward: true });
}

function assertSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || (win !== petWindow && win !== settingsWindow) || event.senderFrame !== event.sender.mainFrame) throw new Error('不允许的窗口请求。');
  const url = event.senderFrame?.url || '';
  if (devUrl ? !url.startsWith(`${devUrl}/`) : !url.startsWith('file://')) throw new Error('不允许的页面来源。');
}
function registerIpc(): void {
  const handle = (channel: string, action: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) => ipcMain.handle(`desktopplay:${channel}`, async (event, ...args) => { assertSender(event); return action(event, ...args); });
  handle('get-state', () => getState());
  handle('update-settings', async (_event, patch) => { await service.updateSettings(patch); return getState(); });
  handle('set-key', async (_event, key) => { await service.setApiKey(key); return getState(); });
  handle('clear-key', async () => { await service.clearApiKey(); return getState(); });
  handle('refresh', async () => { await service.refresh(); return getState(); });
  handle('select-pet', async (_event, id) => { await selectPet(id); return getState(); });
  handle('select-gpt-appearance', async (_event, id) => { await selectGptAppearance(id); return getState(); });
  handle('refresh-codex', async () => { await codex.refresh(); return getState(); });
  handle('open-codex-usage', async () => { await shell.openExternal('https://chatgpt.com/codex/settings/usage'); });
  handle('choose-codex', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)!;
    const selection = await dialog.showOpenDialog(win, { title: '选择已安装的 codex.exe', properties: ['openFile'], filters: [{ name: 'Codex 原生程序', extensions: ['exe'] }] });
    if (!selection.canceled && selection.filePaths[0]) {
      const executablePath = selection.filePaths[0];
      await codex.setExecutablePath(executablePath);
      const filename = path.join(dataDir, 'codex-executable.json');
      await writeFile(`${filename}.tmp`, JSON.stringify({ executablePath })); await rename(`${filename}.tmp`, filename);
      await codex.refresh();
    }
    return getState();
  });
  handle('choose-pet', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)!;
    const selection = await dialog.showOpenDialog(win, { title: '选择桌宠图片', properties: ['openFile'], filters: [{ name: '角色图片', extensions: ['png', 'webp', 'gif'] }] });
    if (!selection.canceled && selection.filePaths[0]) { await assets.import(selection.filePaths[0]); updateTray(); publish(); }
    return getState();
  });
  handle('reset-pet', async () => { await assets.reset(); updateTray(); publish(); return getState(); });
  handle('open-settings', openSettings);
  handle('show-menu', () => {
    Menu.buildFromTemplate([{ label: '切换桌宠', submenu: petMenu() }, { label: 'GPT 造型', submenu: appearanceMenu() }, { label: '设置、余额与额度', click: () => { void openSettings(); } }, { label: '刷新当前额度', click: refreshCurrent }, { type: 'separator' }, { label: '隐藏桌宠', click: () => petWindow?.hide() }, { label: '退出', click: () => app.quit() }]).popup({ window: petWindow ?? undefined });
  });
  handle('hide-pet', () => { finishDrag(); petWindow?.hide(); });
  handle('quit', () => { app.quit(); });
  const onPet = (channel: string, action: (value: unknown) => void) => ipcMain.on(`desktopplay:${channel}`, (event, value) => {
    try { assertSender(event); if (BrowserWindow.fromWebContents(event.sender) === petWindow) action(value); } catch { /* Reject untrusted senders without crashing. */ }
  });
  onPet('start-drag', beginDrag); onPet('end-drag', finishDrag);
  onPet('interactive', (value) => { if (typeof value === 'boolean' && !dragStart) petWindow?.setIgnoreMouseEvents(!value, { forward: true }); });
  onPet('bubble', (value) => { if (typeof value === 'boolean') { bubbleVisible = value; updateHitRegion(); } });
}
