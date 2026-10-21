import type { AppSettings, BubbleProfiles, BubbleRule, BubbleScenario, BubbleStyle, CompletionSource, PetPersona, SoundSlot } from './types';

export const PERSONAS: PetPersona[] = ['whale', 'gpt', 'dragon'];
export const COMPLETION_SOURCES: CompletionSource[] = ['codex', 'chatgpt-work', 'deepseek-harness'];
export const SOUND_SLOTS: SoundSlot[] = ['press', 'release', ...COMPLETION_SOURCES.map(source => `completion-${source}` as const)];
export const SCENARIO_LABELS: Record<BubbleScenario, string> = {
  usage: '用量页', summary: '用量小报告', phrases: '陪伴短句', retention: '换角色挽留',
  'low-balance': '低余额提醒', 'daily-budget': '每日预算提醒', update: '软件更新',
  'completion-codex': 'Codex 完成提醒', 'completion-chatgpt-work': 'ChatGPT Work 结束提醒', 'completion-deepseek-harness': 'DeepSeek Harness 完成提醒',
};
export const SCENARIOS = Object.keys(SCENARIO_LABELS) as BubbleScenario[];
export const builtinSound = (slot: SoundSlot) => slot.startsWith('completion-') ? './assets/completion.wav' : `./assets/${slot}.mp3`;
export const sourceEnabled = (settings: AppSettings, source: CompletionSource) => source === 'codex' ? settings.codexCompletionEnabled : source === 'chatgpt-work' ? settings.chatgptCompletionEnabled : settings.deepseekCompletionEnabled;
export const petPersona = (state: { activePet: string; gptAppearance: string }): PetPersona => state.activePet === 'deepseek' ? 'whale' : state.gptAppearance === 'dragon' ? 'dragon' : 'gpt';

const palettes = {
  whale: ['#edf0ff', '#384d87', '#4b5f9b', '#dee5fc'],
  gpt: ['#effaf4', '#3f7361', '#285c50', '#d9efe4'],
  dragon: ['#f6f0ff', '#624480', '#705392', '#e9dcf8'],
};
export const DEFAULT_BUBBLE_PROFILES: BubbleProfiles = Object.fromEntries(PERSONAS.map(persona => {
  const [background, ink, border, ring] = palettes[persona];
  const messages: Record<string, string[]> = {
    retention: ['我还想陪着你，再留一会儿，好吗？', '代码还没写完呢，再陪我一会儿，好吗？', '翅膀还为你留着位置，再陪我一会儿吧。'],
    'low-balance': ['小鲸鱼发现余额有点少啦，记得补充哦。', '余额低于提醒金额，留意账户余量。', '储备渐少，我会陪你留意补给。'],
    'daily-budget': ['今天的投入达到预算啦，休息一下吧～', '今日观测消费已达预算，留意使用节奏。', '今日补给已达预算，我替你记下了。'],
    update: ['有新版本来找你啦～', '发现新版本，可以查看更新。', '新的旅程已备妥，去看看更新吧。'],
  };
  const index = PERSONAS.indexOf(persona);
  const rules = Object.fromEntries(SCENARIOS.map(scenario => {
    let message = messages[scenario]?.[index] ?? '';
    if (scenario.startsWith('completion-')) {
      const name = scenario === 'completion-codex' ? 'Codex' : scenario === 'completion-chatgpt-work' ? 'ChatGPT Work' : 'DeepSeek';
      message = scenario === 'completion-chatgpt-work'
        ? [`${name} 的这一轮结束啦，快去看看吧～`, `${name} 本轮对话已结束，来看看吧。`, `${name} 的回合已结束，我在这里等你。`][index]
        : [`${name} 已经回复完啦，快去看看吧～`, `${name} 这轮输出完成了，来看看结果吧。`, `${name} 的答复已送达，我替你守候着。`][index];
    }
    return [scenario, { enabled: true, title: scenario === 'usage' ? `${persona === 'whale' ? 'DeepSeek' : 'GPT'} 用量` : SCENARIO_LABELS[scenario], message, style: {}, timing: {}, soundEnabled: false, volume: .35 } satisfies BubbleRule];
  }));
  return [persona, { style: { background, ink, border, ring, font: 'system', fontScale: 1, backgroundOpacity: 1 }, timing: { durationSeconds: 3, hoverDelaySeconds: 0 }, rules }];
})) as BubbleProfiles;

export function resolveBubble(profiles: BubbleProfiles, persona: PetPersona, scenario: BubbleScenario) {
  const base = profiles[persona], rule = base.rules[scenario];
  return { ...rule, style: { ...base.style, ...rule.style }, timing: { ...base.timing, ...rule.timing } };
}

const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function keys(value: unknown, allowed: string[], complete = false): asserts value is Record<string, unknown> {
  if (!plain(value) || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value')) || (complete && allowed.some(key => !Object.hasOwn(value, key)))) throw new Error('气泡配置字段无效');
}
const numeric = (value: unknown, min: number, max: number, integer = false) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
export function validateBubbleProfiles(value: unknown): asserts value is BubbleProfiles {
  keys(value, PERSONAS, true);
  const validateStyle = (style: unknown, complete: boolean) => {
    keys(style, ['background', 'ink', 'border', 'ring', 'font', 'fontScale', 'backgroundOpacity'], complete);
    for (const [key, field] of Object.entries(style)) {
      if (['background', 'ink', 'border', 'ring'].includes(key) ? typeof field !== 'string' || !/^#[0-9a-f]{6}$/i.test(field) : key === 'font' ? !['system', 'yahei', 'dengxian', 'kaiti'].includes(field as string) : !numeric(field, key === 'fontScale' ? .75 : .6, key === 'fontScale' ? 1.25 : 1)) throw new Error('气泡外观设置无效');
    }
  };
  const validateTiming = (timing: unknown, complete: boolean) => {
    keys(timing, ['durationSeconds', 'hoverDelaySeconds'], complete);
    for (const [key, field] of Object.entries(timing)) if (!numeric(field, key === 'durationSeconds' ? 1 : 0, 60, true)) throw new Error('气泡时间设置无效');
  };
  for (const profile of Object.values(value)) {
    keys(profile, ['style', 'timing', 'rules'], true); validateStyle(profile.style, true); validateTiming(profile.timing, true); keys(profile.rules, SCENARIOS, true);
    for (const [scenario, rule] of Object.entries(profile.rules)) {
      keys(rule, ['enabled', 'title', 'message', 'style', 'timing', 'soundEnabled', 'volume'], true);
      if (typeof rule.enabled !== 'boolean' || typeof rule.soundEnabled !== 'boolean' || !numeric(rule.volume, 0, 1) || typeof rule.title !== 'string' || !rule.title.trim() || rule.title.length > 40 || typeof rule.message !== 'string' || rule.message.length > 200 || ((scenario.startsWith('completion-') || scenario === 'retention') && !rule.message.trim())) throw new Error('气泡标题、文案或音效设置无效');
      validateStyle(rule.style, false); validateTiming(rule.timing, false);
    }
  }
}
