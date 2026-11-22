import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/defaults';
import { reminderSetupSteps } from '../../src/shared/reminder-setup';
import type { CodexCompletionState } from '../../src/shared/types';

const event = '2026-11-22T04:20:00.000Z';
const listener = (status: CodexCompletionState['status'], directory = '', lastAttentionAt?: string): CodexCompletionState =>
  ({ status, directory, lastAttentionAt, error: null });
const fixture = () => ({
  settings: structuredClone(DEFAULT_SETTINGS),
  codexCompletion: listener('watching', 'D:/codex'),
  codexAttention: listener('starting', 'D:/codex'),
  chatgptCompletion: listener('watching'),
  deepseekCompletion: listener('watching', 'D:/dsh/sessions'),
  geminiIntegration: '完成监听：本机摘要 · App 监听中',
});

describe('reminder setup', () => {
  it('reports Codex setup separately from the event, with client trust left as an instruction', () => {
    const state = fixture();
    state.settings.codexHookEnabled = true;
    expect(reminderSetupSteps(state, 'codex').map(step => step.complete)).toEqual([true, true, undefined, false]);
    state.codexAttention = listener('watching', 'D:/codex', event);
    expect(reminderSetupSteps(state, 'codex').map(step => step.complete)).toEqual([true, true, undefined, true]);
    state.settings.codexCompletionDirectory = 'D:/new-codex';
    expect(reminderSetupSteps(state, 'codex').map(step => step.complete)).toEqual([false, false, undefined, false]);
  });

  it('checks ChatGPT log access and observed events independently of client settings', () => {
    const state = fixture();
    expect(reminderSetupSteps(state, 'chatgpt-work').map(step => step.complete)).toEqual([true, undefined, false]);
    state.chatgptCompletion = listener('watching', '', event);
    expect(reminderSetupSteps(state, 'chatgpt-work').map(step => step.complete)).toEqual([true, undefined, true]);
    state.settings.attentionEnabledBySource['chatgpt-work'] = false;
    expect(reminderSetupSteps(state, 'chatgpt-work').map(step => step.complete)).toEqual([true, undefined, undefined]);
  });

  it('checks the saved DSH directory and leaves event verification to the user', () => {
    const state = fixture();
    state.settings.deepseekCompletionDirectory = 'D:\\dsh\\old\\..\\sessions\\';
    expect(reminderSetupSteps(state, 'deepseek-harness').map(step => step.complete)).toEqual([true, undefined]);
    state.settings.deepseekCompletionDirectory = 'D:/new-dsh/sessions';
    expect(reminderSetupSteps(state, 'deepseek-harness').map(step => step.complete)).toEqual([false, undefined]);
  });

  it('reports Gemini summary and optional Hook setup from their respective status evidence', () => {
    const state = fixture();
    expect(reminderSetupSteps(state, 'antigravity').map(step => step.complete)).toEqual([true, undefined, undefined]);
    state.settings.geminiHookEnabled = true;
    state.geminiIntegration = 'Gemini hook 配置有冲突或不可写';
    expect(reminderSetupSteps(state, 'antigravity').map(step => step.complete)).toEqual([false, false, undefined]);
    state.geminiIntegration = '完成 hook 已接入 · App 未发现记录';
    expect(reminderSetupSteps(state, 'antigravity').map(step => step.complete)).toEqual([false, true, undefined]);
  });
});
