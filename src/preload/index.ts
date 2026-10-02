import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, DesktopApi } from '../shared/types';

const api: DesktopApi = {
  getState: () => ipcRenderer.invoke('desktopplay:get-state'),
  updateSettings: (patch) => ipcRenderer.invoke('desktopplay:update-settings', patch),
  setApiKey: (key) => ipcRenderer.invoke('desktopplay:set-key', key),
  clearApiKey: () => ipcRenderer.invoke('desktopplay:clear-key'),
  refreshBalance: () => ipcRenderer.invoke('desktopplay:refresh'),
  choosePet: () => ipcRenderer.invoke('desktopplay:choose-pet'),
  resetPet: () => ipcRenderer.invoke('desktopplay:reset-pet'),
  openSettings: () => ipcRenderer.invoke('desktopplay:open-settings'),
  showMenu: () => ipcRenderer.invoke('desktopplay:show-menu'),
  hidePet: () => ipcRenderer.invoke('desktopplay:hide-pet'),
  quit: () => ipcRenderer.invoke('desktopplay:quit'),
  startDrag: () => ipcRenderer.send('desktopplay:start-drag'),
  endDrag: () => ipcRenderer.send('desktopplay:end-drag'),
  setInteractive: (value) => ipcRenderer.send('desktopplay:interactive', value),
  setBubbleVisible: (value) => ipcRenderer.send('desktopplay:bubble', value),
  onState: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, state: AppState) => callback(state);
    ipcRenderer.on('desktopplay:state', listener);
    return () => ipcRenderer.removeListener('desktopplay:state', listener);
  },
};
contextBridge.exposeInMainWorld('desktopPlay', Object.freeze(api));
