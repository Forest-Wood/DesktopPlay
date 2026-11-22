import { demoGeminiQuota } from '../shared/gemini';
import { GEMINI_PETS } from '../shared/defaults';
import { dateInZone, systemTimeZone } from '../shared/deepseek-time';
import { builtinSound } from '../shared/bubble-settings';
import { BUILTIN_PETS, DEFAULT_SETTINGS, GPT_DRAGON_PET, DEFAULT_SOUNDS } from '../shared/defaults';
import type { AppState, DesktopApi } from '../shared/types';
import { initialUpdateState } from '../shared/app-update';

export function createDemoApi(): DesktopApi {
  const savedPet = localStorage.getItem('desktopplay-demo-pet');
  const activePet = savedPet === 'gemini' || savedPet === 'gpt' ? savedPet : 'deepseek';
  const geminiAppearance = localStorage.getItem('desktopplay-demo-gemini') === 'sketch' ? 'sketch' : 'classic';
  const gptAppearance = localStorage.getItem('desktopplay-demo-appearance') === 'dragon' ? 'dragon' : 'classic';
  const now = new Date();
  const zone = systemTimeZone();
  const history = ['0.82', '1.57', '0.68', '2.31', '1.40', '2.07', '1.24'].map((spent, index) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index - 6);
    return { date: dateInZone(day), timeZone: zone, segmentId: 'demo', currency: 'CNY' as const, spent, increased: '0', startedAt: day.toISOString() };
  });
  let state: AppState = {
    petVisible: true, geminiAppearance, geminiQuota: demoGeminiQuota(), geminiIntegration: '完成监听：本机摘要 · App 监听中',
    appUpdate: initialUpdateState(),
    codexAttention: { status: 'disabled', directory: '浏览器演示不配置 hook', error: null, lastAttentionAt: null },
    codexCompletion: { status: 'watching', directory: '浏览器演示不读取本机会话', error: null },
    deepseekCompletion: { status: 'unavailable', directory: '浏览器演示不读取 DSH 会话', error: null },
    chatgptCompletion: { status: 'watching', directory: '浏览器演示不读取桌面通知', error: null, lastAttentionAt: now.toISOString() },
    sounds: structuredClone(DEFAULT_SOUNDS),
    settings: structuredClone(DEFAULT_SETTINGS), hasApiKey: false, balance: { currency: 'CNY', total: '28.36000000', granted: '0.00000000', toppedUp: '28.36000000', observedAt: new Date().toISOString(), isAvailable: true },
    ledger: { today: history.at(-1)!, history },
    status: 'ready', error: null, warning: null, alert: null, pet: { ...(activePet === 'gemini' ? GEMINI_PETS[geminiAppearance] : activePet === 'gpt' && gptAppearance === 'dragon' ? GPT_DRAGON_PET : BUILTIN_PETS[activePet]) }, activePet, gptAppearance, hasCustomGpt: false, flipped: false, verticalFlipped: false, bubblePlacement: 'above',
    codex: { resetCredits: { availableCount: 2, credits: [{ id: 'demo-reset', status: 'available', expiresAt: new Date(Date.now() + 604800000).toISOString() }] }, planType: 'pro', status: 'ready', source: 'codex-app-server', available: true, updatedAt: new Date().toISOString(), error: null, buckets: [{ id: 'demo', name: 'Codex · 演示数据', planType: 'pro', primary: { usedPercent: 24, remainingPercent: 76, windowMinutes: 300, resetsAt: new Date(Date.now() + 10800000).toISOString() }, secondary: { usedPercent: 42, remainingPercent: 58, windowMinutes: 10080, resetsAt: new Date(Date.now() + 345600000).toISOString() }, creditsRemaining: null, unlimitedCredits: false }] },
  };
  const listeners = new Set<(state: AppState) => void>();
  const emit = () => { listeners.forEach(listener => listener(state)); return Promise.resolve(state); };
  return {
    checkForUpdates: async () => state.appUpdate,
    downloadUpdate: async () => state.appUpdate,
    cancelUpdateDownload: async () => state.appUpdate,
    installUpdate: async () => ({ started: false }),
    onUpdateAvailable: () => () => {},
    onSettingsPage: () => () => {},
    chooseDeepseekCompletionDirectory: async () => { throw new Error('请在桌面应用中选择 DSH 会话目录。'); },
    chooseCodexCompletionDirectory: async () => { throw new Error('请在桌面应用中选择 Codex 目录。'); },
    onConversationNotice: () => () => {},
    onCodexCompletion: () => () => {},
    onPetHidden: () => () => {},
    getState: async () => state,
    updateSettings: async patch => { state = { ...state, settings: { ...state.settings, ...patch } }; return emit(); },
    setApiKey: async () => { state = { ...state, hasApiKey: true }; return emit(); },
    clearApiKey: async () => { state = { ...state, hasApiKey: false }; return emit(); },
    refreshBalance: async () => { state = { ...state, balance: { ...state.balance!, observedAt: new Date().toISOString() } }; return emit(); },
    choosePet: async () => { throw new Error('本地演示模式无法导入文件，请在桌面应用中使用。'); },
    chooseSound: async () => { throw new Error('请在桌面应用中导入音效。'); },
    resetSound: async (persona, slot) => { state.sounds[persona][slot] = { ...DEFAULT_SOUNDS[persona][slot], revision: String(Date.now()) }; return emit(); },
    getSoundData: async (persona, slot) => ({ url: builtinSound(slot), revision: state.sounds[persona][slot].revision, warning: null }),
    getUninstallInfo: async () => ({ kind: 'unsupported', programPath: null, dataPath: '%APPDATA%\\DesktopPlay', available: false, reason: '浏览器演示不提供卸载，请在桌面应用中使用。' }),
    requestUninstall: async () => ({ started: false }),
    resetPet: async () => { if (state.activePet === 'gemini') { localStorage.setItem('desktopplay-demo-gemini', 'classic'); state.geminiAppearance = 'classic'; } if (state.activePet === 'gpt') localStorage.setItem('desktopplay-demo-appearance', 'classic'); state = { ...state, gptAppearance: state.activePet === 'gpt' ? 'classic' : state.gptAppearance, pet: { ...BUILTIN_PETS[state.activePet] } }; return emit(); },
    selectPet: async id => { localStorage.setItem('desktopplay-demo-pet', id); state = { ...state, activePet: id, pet: { ...(id === 'gemini' ? GEMINI_PETS[state.geminiAppearance] : id === 'gpt' && state.gptAppearance === 'dragon' ? GPT_DRAGON_PET : BUILTIN_PETS[id]) } }; return emit(); },
    selectGeminiAppearance: async id => { localStorage.setItem('desktopplay-demo-gemini', id); state = { ...state, geminiAppearance: id, pet: state.activePet === 'gemini' ? GEMINI_PETS[id] : state.pet }; return emit(); },
    refreshGeminiQuota: async () => { state = { ...state, geminiQuota: demoGeminiQuota() }; return emit(); },
    selectGptAppearance: async id => {
      if (id !== 'classic' && id !== 'dragon') throw new Error('本地演示不提供自定义图片。');
      localStorage.setItem('desktopplay-demo-appearance', id);
      state = { ...state, gptAppearance: id, pet: { ...(state.activePet === 'gpt' ? id === 'dragon' ? GPT_DRAGON_PET : BUILTIN_PETS.gpt : state.pet) } }; return emit();
    },
    refreshCodexQuota: async () => { state = { ...state, codex: { ...state.codex, updatedAt: new Date().toISOString() } }; return emit(); },
    chooseCodexExecutable: async () => { throw new Error('请在桌面应用中选择 codex.exe，本地演示不读取真实账户。'); },
    openCodexUsage: async () => { window.open('https://chatgpt.com/codex/settings/usage', '_blank', 'noopener'); },
    openSettings: async page => { location.href = `?view=settings${page ? '&page=version' : ''}`; },
    showMenu: async () => { location.href = '?view=settings'; }, hidePet: async () => {}, quit: async () => {},
    startDrag: () => {}, endDrag: () => {}, setInteractive: () => {}, setBubbleVisible: () => {},
    onState: callback => { listeners.add(callback); return () => listeners.delete(callback); },
  };
}
