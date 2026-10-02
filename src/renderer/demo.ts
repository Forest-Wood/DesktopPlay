import { BUILTIN_PETS, DEFAULT_SETTINGS, GPT_DRAGON_PET } from '../shared/defaults';
import type { AppState, DesktopApi } from '../shared/types';

export function createDemoApi(): DesktopApi {
  const activePet = localStorage.getItem('desktopplay-demo-pet') === 'gpt' ? 'gpt' : 'deepseek';
  const gptAppearance = localStorage.getItem('desktopplay-demo-appearance') === 'dragon' ? 'dragon' : 'classic';
  let state: AppState = {
    settings: { ...DEFAULT_SETTINGS }, hasApiKey: false, balance: { currency: 'CNY', total: '28.36000000', granted: '0.00000000', toppedUp: '28.36000000', observedAt: new Date().toISOString(), isAvailable: true },
    ledger: { today: { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()), currency: 'CNY', spent: '1.24000000', increased: '0.00000000', startedAt: new Date().toISOString() }, history: [] },
    status: 'ready', error: null, warning: null, alert: null, pet: { ...(activePet === 'gpt' && gptAppearance === 'dragon' ? GPT_DRAGON_PET : BUILTIN_PETS[activePet]) }, activePet, gptAppearance, hasCustomGpt: false, flipped: false, verticalFlipped: false, bubblePlacement: 'above',
    codex: { status: 'ready', source: 'codex-app-server', available: true, updatedAt: new Date().toISOString(), error: null, buckets: [{ id: 'demo', name: 'Codex · 演示数据', planType: '示例', primary: { usedPercent: 24, remainingPercent: 76, windowMinutes: 300, resetsAt: new Date(Date.now() + 10800000).toISOString() }, secondary: { usedPercent: 42, remainingPercent: 58, windowMinutes: 10080, resetsAt: new Date(Date.now() + 345600000).toISOString() }, creditsRemaining: null, unlimitedCredits: false }] },
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
    resetPet: async () => { if (state.activePet === 'gpt') localStorage.setItem('desktopplay-demo-appearance', 'classic'); state = { ...state, gptAppearance: state.activePet === 'gpt' ? 'classic' : state.gptAppearance, pet: { ...BUILTIN_PETS[state.activePet] } }; return emit(); },
    selectPet: async id => { localStorage.setItem('desktopplay-demo-pet', id); state = { ...state, activePet: id, pet: { ...(id === 'gpt' && state.gptAppearance === 'dragon' ? GPT_DRAGON_PET : BUILTIN_PETS[id]) } }; return emit(); },
    selectGptAppearance: async id => {
      if (id !== 'classic' && id !== 'dragon') throw new Error('本地演示不提供自定义图片。');
      localStorage.setItem('desktopplay-demo-appearance', id);
      state = { ...state, gptAppearance: id, pet: { ...(state.activePet === 'gpt' ? id === 'dragon' ? GPT_DRAGON_PET : BUILTIN_PETS.gpt : state.pet) } }; return emit();
    },
    refreshCodexQuota: async () => { state = { ...state, codex: { ...state.codex, updatedAt: new Date().toISOString() } }; return emit(); },
    chooseCodexExecutable: async () => { throw new Error('请在桌面应用中选择 codex.exe，本地演示不读取真实账户。'); },
    openCodexUsage: async () => { window.open('https://chatgpt.com/codex/settings/usage', '_blank', 'noopener'); },
    openSettings: async () => { location.href = '?view=settings'; },
    showMenu: async () => { location.href = '?view=settings'; }, hidePet: async () => {}, quit: async () => {},
    startDrag: () => {}, endDrag: () => {}, setInteractive: () => {}, setBubbleVisible: () => {},
    onState: callback => { listeners.add(callback); return () => listeners.delete(callback); },
  };
}
