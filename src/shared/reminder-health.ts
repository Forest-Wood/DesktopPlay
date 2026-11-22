import { sourceEnabled } from './bubble-settings';
import type { AppState, CompletionSource } from './types';

export const REMINDER_SOURCES = [
  ['antigravity', 'Gemini · Antigravity'],
  ['codex', 'Codex'],
  ['chatgpt-work', 'ChatGPT App'],
  ['deepseek-harness', 'DeepSeek Harness'],
] as const satisfies readonly (readonly [CompletionSource, string])[];

export type ReminderTone = 'off' | 'err' | 'warn' | 'ok' | 'info';

const healthLabels: Record<ReminderTone, string> = {
  off: '已关闭',
  err: '异常',
  warn: '需要操作',
  ok: '已收到事件',
  info: '监听中',
};

type ReminderState = Pick<AppState, 'settings' | 'codexCompletion' | 'codexAttention' | 'chatgptCompletion' | 'deepseekCompletion' | 'geminiIntegration'>;

export function reminderHealth(state: ReminderState, source: CompletionSource, hasSetupDraft = false) {
  const completion = sourceEnabled(state.settings, source);
  const attention = state.settings.attentionEnabledBySource[source];
  const codexHook = attention && state.settings.codexHookEnabled;
  const sharedListener = source === 'chatgpt-work' ? state.chatgptCompletion : state.deepseekCompletion;
  const listeners = source === 'antigravity' ? [] : source === 'codex'
    ? [...(completion ? [state.codexCompletion] : []), ...(codexHook ? [state.codexAttention] : [])]
    : [sharedListener];
  const lastAttentionAt = attention ? (source === 'codex' ? (codexHook ? state.codexAttention.lastAttentionAt : null)
    : source === 'antigravity' ? null : sharedListener.lastAttentionAt) ?? null : null;
  const gemini = source === 'antigravity' ? state.geminiIntegration : '';
  const geminiConnected = gemini.split(' · ').some(part => part.endsWith('监听中'))
    || (!attention && gemini.includes('完成 hook 已接入'));

  let tone: ReminderTone;
  if (!completion && !attention) tone = 'off';
  else if (listeners.some(listener => listener.status === 'error') || /冲突|不可写|无法读取 Gemini/.test(gemini)) tone = 'err';
  else if (hasSetupDraft || listeners.some(listener => listener.status === 'unavailable')
    || (source === 'codex' && attention && (!codexHook || !lastAttentionAt))
    || (source === 'antigravity' && !geminiConnected && /未发现记录|需启用 hook/.test(gemini))) tone = 'warn';
  else if (lastAttentionAt) tone = 'ok';
  else if (geminiConnected || listeners.some(listener => listener.status === 'watching' || listener.status === 'starting')) tone = 'info';
  else tone = 'warn';

  return { source, completion, attention, tone, label: healthLabels[tone], lastAttentionAt };
}
