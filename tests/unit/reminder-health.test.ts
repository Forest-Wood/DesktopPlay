import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/defaults';
import { reminderHealth } from '../../src/shared/reminder-health';
import type { CodexCompletionState } from '../../src/shared/types';

const event = '2026-11-22T04:20:00.000Z';
const listener = (status: CodexCompletionState['status'], lastAttentionAt?: string): CodexCompletionState =>
  ({ status, directory: '', error: null, lastAttentionAt });
const fixture = () => ({
  settings: structuredClone(DEFAULT_SETTINGS),
  codexCompletion: listener('watching'),
  codexAttention: listener('watching', event),
  chatgptCompletion: listener('watching'),
  deepseekCompletion: listener('starting'),
  geminiIntegration: '完成监听：本机摘要 · App 监听中',
});

describe('reminder health', () => {
  it('treats a disabled source as off even if an old listener still reports an error', () => {
    const state = fixture();
    state.settings.codexCompletionEnabled = false;
    state.settings.attentionEnabledBySource.codex = false;
    state.codexAttention = listener('error', event);
    expect(reminderHealth(state, 'codex', true)).toMatchObject({
      tone: 'off', completion: false, attention: false, lastAttentionAt: null,
    });
  });

  it('prioritizes active listener errors and setup drafts over past events', () => {
    const state = fixture();
    state.settings.codexHookEnabled = true;
    state.codexCompletion = listener('error');
    expect(reminderHealth(state, 'codex', true)).toMatchObject({ tone: 'err', lastAttentionAt: event });
    state.codexCompletion = listener('watching');
    expect(reminderHealth(state, 'codex', true).tone).toBe('warn');
    expect(reminderHealth(state, 'codex')).toMatchObject({ tone: 'ok', lastAttentionAt: event });
  });

  it('requires setup when Codex hook has no event or a shared listener is unavailable', () => {
    const state = fixture();
    state.settings.codexHookEnabled = true;
    state.codexAttention = listener('starting');
    state.deepseekCompletion = listener('unavailable');
    expect(reminderHealth(state, 'codex').tone).toBe('warn');
    expect(reminderHealth(state, 'deepseek-harness').tone).toBe('warn');
  });

  it('uses the active ChatGPT listener and ignores attention time when its switch is off', () => {
    const state = fixture();
    state.chatgptCompletion = listener('watching', event);
    expect(reminderHealth(state, 'chatgpt-work').tone).toBe('ok');
    state.settings.attentionEnabledBySource['chatgpt-work'] = false;
    expect(reminderHealth(state, 'chatgpt-work')).toMatchObject({ tone: 'info', lastAttentionAt: null, attention: false });
  });

  it('distinguishes Gemini listening, missing records and configuration conflicts', () => {
    const state = fixture();
    expect(reminderHealth(state, 'antigravity')).toMatchObject({ tone: 'info', lastAttentionAt: null });
    state.geminiIntegration = '完成监听：本机摘要 · App 未发现记录';
    expect(reminderHealth(state, 'antigravity').tone).toBe('warn');
    state.geminiIntegration = 'Gemini hook 配置有冲突或不可写';
    expect(reminderHealth(state, 'antigravity', true).tone).toBe('err');
  });
});
