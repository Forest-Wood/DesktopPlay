import { DEFAULT_PET, DEFAULT_SETTINGS } from '../shared/defaults';
import type { AppState, DesktopApi } from '../shared/types';

export function createDemoApi(): DesktopApi {
  let state: AppState = {
    settings: { ...DEFAULT_SETTINGS }, hasApiKey: false, balance: { currency: 'CNY', total: '28.36000000', granted: '0.00000000', toppedUp: '28.36000000', observedAt: new Date().toISOString(), isAvailable: true },
    ledger: { today: { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()), currency: 'CNY', spent: '1.24000000', increased: '0.00000000', startedAt: new Date().toISOString() }, history: [] },
    status: 'ready', error: null, warning: null, alert: null, pet: { ...DEFAULT_PET }, flipped: false,
  };
  const listeners = new Set<(state: AppState) => void>();
  const emit = () => { listeners.forEach(listener => listener(state)); return Promise.resolve(state); };
  return {
    getState: async () => state,
    updateSettings: async patch => { state = { ...state, settings: { ...state.settings, ...patch } }; return emit(); },
    setApiKey: async () => { state = { ...state, hasApiKey: true }; return emit(); },
    clearApiKey: async () => { state = { ...state, hasApiKey: false }; return emit(); },
    refreshBalance: async () => { state = { ...state, balance: { ...state.balance!, observedAt: new Date().toISOString() } }; return emit(); },
    choosePet: async () => { throw new Error('本地演示模式无法导入文件，请在桌面应用中使用。'); },
    resetPet: async () => { state = { ...state, pet: { ...DEFAULT_PET } }; return emit(); },
    openSettings: async () => { location.href = '?view=settings'; },
    showMenu: async () => { location.href = '?view=settings'; }, hidePet: async () => {}, quit: async () => {},
    startDrag: () => {}, endDrag: () => {}, setInteractive: () => {}, setBubbleVisible: () => {},
    onState: callback => { listeners.add(callback); return () => listeners.delete(callback); },
  };
}
