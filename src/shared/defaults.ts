import type { AppSettings, BuiltinPetId, PetAsset, PetPersona, SoundMetadataMap } from './types';
export const APP_VERSION = '0.5.0';
export const DEFAULT_SOUNDS: SoundMetadataMap = Object.fromEntries(['whale', 'gpt', 'dragon'].map(persona => [persona, {
  press: { name: '内置按下音效', isCustom: false, revision: 'default', warning: null },
  release: { name: '内置松开音效', isCustom: false, revision: 'default', warning: null },
}])) as SoundMetadataMap;
export const DEFAULT_PHRASES_BY_PERSONA: Record<PetPersona, string[]> = {
  whale: ['今天也要照顾好自己呀。', '小鲸鱼正在替你看着余额～', '工作一会儿，记得眺望远方。'],
  gpt: ['代码慢慢写，我会陪着你。', '休息一下，灵感也需要呼吸。', '又解决了一个问题，记得保存呀。'],
  dragon: ['我会收起翅膀，安静陪着你。', '让眼睛休息一会儿吧，旅途还很长。', '今天的努力，我都替你珍藏着。'],
};
export const DEFAULT_SETTINGS: AppSettings = {
  alwaysOnTop: true,
  launchAtLogin: false,
  snapToEdges: true,
  scale: 1,
  soundEnabled: true,
  volume: 0.35,
  phrases: ['今天也要照顾好自己呀。', '小鲸鱼正在替你看着余额～', '工作一会儿，记得眺望远方。'],
  phrasesByPersona: structuredClone(DEFAULT_PHRASES_BY_PERSONA),
  lowBalanceThreshold: null,
  dailyBudget: null,
};
export const DEFAULT_PET = { name: '小鲸鱼', url: './assets/whale.png', isCustom: false };
export const GPT_PET = { name: 'GPT 小伙伴', url: './assets/gpt.png', isCustom: false };
export const GPT_DRAGON_PET: PetAsset = { name: 'GPT 白龙', url: './assets/gpt-dragon-v2.png', isCustom: false,
  contentBounds: { x: 70, y: 57, width: 1120, height: 1129, imageWidth: 1254, imageHeight: 1254 } };
export const BUILTIN_PETS: Record<BuiltinPetId, PetAsset> = { deepseek: DEFAULT_PET, gpt: GPT_PET };
