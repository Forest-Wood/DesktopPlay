import { PERSONAS, petPersona } from './bubble-settings';
import type { AppSettings, AppState, PetPersona } from './types';

export const PET_NICKNAME_DEFAULTS: Readonly<AppSettings['petNicknames']> = {
  whale: '小鲸鱼', gpt: '原版 GPT', dragon: '白龙', gemini: 'Gemini 星猫',
};
export const EMPTY_PET_NICKNAMES: Readonly<AppSettings['petNicknames']> = { whale: '', gpt: '', dragon: '', gemini: '' };
export const PET_NICKNAME_LENGTH = 24;

export function normalizePetNicknames(value: unknown): AppSettings['petNicknames'] {
  if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || Reflect.ownKeys(value).length !== PERSONAS.length) throw new Error('伙伴昵称设置无效');
  const result = { ...EMPTY_PET_NICKNAMES };
  for (const persona of PERSONAS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, persona);
    const name: unknown = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    if (typeof name !== 'string' || /[\p{Cc}\p{Cs}\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(name)
      || Array.from(name.trim()).length > PET_NICKNAME_LENGTH) {
      throw new Error(`伙伴昵称须为最多 ${PET_NICKNAME_LENGTH} 个字符的单行文字`);
    }
    result[persona] = name.trim();
  }
  return result;
}

export function personaNickname(settings: Pick<AppSettings, 'petNicknames'>, persona: PetPersona): string {
  return settings.petNicknames[persona] || PET_NICKNAME_DEFAULTS[persona];
}

export function petNickname(state: Pick<AppState, 'activePet' | 'gptAppearance' | 'settings'>): string {
  return personaNickname(state.settings, petPersona(state));
}
