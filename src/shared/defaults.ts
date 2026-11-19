import { DEFAULT_BUBBLE_PROFILES, PERSONAS, SOUND_SLOTS } from './bubble-settings';
import { phraseDisplays } from './phrases';
import type { AppSettings, BuiltinPetId, PetAsset, PetPersona, SoundMetadataMap } from './types';
export const APP_VERSION = '2.0.2';
export const DEFAULT_COMPLETION_MESSAGES: Record<PetPersona, string> = {
  gemini: '这轮任务完成啦，来看看吧。',
  whale: 'GPT 已经回复完啦，快去看看吧～',
  gpt: '这轮输出完成了，来看看结果吧。',
  dragon: 'GPT 的答复已送达，我替你守候着。',
};
export const DEFAULT_SOUNDS: SoundMetadataMap = Object.fromEntries(PERSONAS.map(persona => [persona, Object.fromEntries(SOUND_SLOTS.map(slot => [slot, { name: slot === 'press' ? '内置按下音效' : slot === 'release' ? '内置松开音效' : '内置轻提示音', isCustom: false, revision: 'default', warning: null }]))])) as SoundMetadataMap;
export const DEFAULT_PHRASES_BY_PERSONA: Record<PetPersona, string[]> = {
  gemini: ['星星亮着，我陪你慢慢写。', '休息一下，伸个懒腰吧。'],
  whale: ['今天也要照顾好自己呀。', '小鲸鱼正在替你看着余额～', '工作一会儿，记得眺望远方。'],
  gpt: ['代码慢慢写，我会陪着你。', '休息一下，灵感也需要呼吸。', '又解决了一个问题，记得保存呀。'],
  dragon: ['我会收起翅膀，安静陪着你。', '让眼睛休息一会儿吧，旅途还很长。', '今天的努力，我都替你珍藏着。'],
};
export const DEFAULT_SETTINGS: AppSettings = {
  petMode: 'full',
  autoCheckUpdates: true,
  alwaysOnTop: true,
  launchAtLogin: false,
  snapToEdges: true,
  scale: 1,
  soundEnabled: true,
  volume: 0.35,
  bubbleDurationSeconds: 3,
  bubbleHoverDelaySeconds: 0,
  codexCompletionEnabled: true,
  chatgptCompletionEnabled: true,
  deepseekCompletionEnabled: true,
  attentionEnabledBySource: { codex: true, 'chatgpt-work': true, 'deepseek-harness': true, antigravity: true },
  geminiCompletionEnabled: true,
  geminiHookEnabled: false,
  codexHookEnabled: false,
  deepseekCompletionDirectory: null,
  bubbleProfilesByPersona: structuredClone(DEFAULT_BUBBLE_PROFILES),
  codexCompletionDirectory: null,
  completionMessagesByPersona: { ...DEFAULT_COMPLETION_MESSAGES },
  phrases: ['今天也要照顾好自己呀。', '小鲸鱼正在替你看着余额～', '工作一会儿，记得眺望远方。'],
  phrasesByPersona: structuredClone(DEFAULT_PHRASES_BY_PERSONA),
  phraseDisplayByPersona: phraseDisplays(DEFAULT_PHRASES_BY_PERSONA),
  lowBalanceThreshold: null,
  dailyBudget: null,
};
export const DEFAULT_PET = { name: '小鲸鱼', url: './assets/whale.png', isCustom: false };
export const GPT_PET = { name: 'GPT 小伙伴', url: './assets/gpt.png', isCustom: false };
export const GPT_DRAGON_PET: PetAsset = { name: 'GPT 白龙', url: './assets/gpt-dragon-v2.png', isCustom: false,
  contentBounds: { x: 70, y: 57, width: 1120, height: 1129, imageWidth: 1254, imageHeight: 1254 } };
export const GEMINI_PETS: Record<import('./types').GeminiAppearance, PetAsset> = {
  classic: { name: 'Gemini · 经典', url: './assets/gemini-classic.png', isCustom: false, contentBounds: { x: 1, y: 9, width: 1253, height: 1245, imageWidth: 1254, imageHeight: 1254 } },
  sketch: { name: 'Gemini · 手绘', url: './assets/gemini-sketch.png', isCustom: false, contentBounds: { x: 0, y: 0, width: 1254, height: 1254, imageWidth: 1254, imageHeight: 1254 } },
};
export const BUILTIN_PETS: Record<BuiltinPetId, PetAsset> = { deepseek: DEFAULT_PET, gpt: GPT_PET, gemini: GEMINI_PETS.classic };
