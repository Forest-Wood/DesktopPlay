import type { AppSettings, BuiltinPetId, PetAsset } from './types';
export const DEFAULT_SETTINGS: AppSettings = {
  alwaysOnTop: true,
  launchAtLogin: false,
  snapToEdges: true,
  scale: 1,
  soundEnabled: true,
  volume: 0.35,
  phrases: ['今天也要照顾好自己呀。', '小鲸鱼正在替你看着余额～', '工作一会儿，记得眺望远方。'],
  lowBalanceThreshold: null,
  dailyBudget: null,
};
export const DEFAULT_PET = { name: '小鲸鱼', url: './assets/whale.png', isCustom: false };
export const GPT_PET = { name: 'GPT 小伙伴', url: './assets/gpt.png', isCustom: false };
export const BUILTIN_PETS: Record<BuiltinPetId, PetAsset> = { deepseek: DEFAULT_PET, gpt: GPT_PET };
