import { GEMINI_WINDOWS } from '../shared/gemini';
import type { GeminiQuotaState } from '../shared/types';
import { localTime, remainingLabel } from './quota';

export function geminiStatus(state: GeminiQuotaState, demo: boolean) {
  const updated = state.updatedAt ? '上次更新 ' + localTime(state.updatedAt) : '';
  const text = demo ? '演示额度' : state.status === 'error' ? state.error : state.status === 'loading' ? '正在刷新…' : !state.updatedAt ? '尚未读取额度' : '';
  return [text, updated].filter(Boolean).join(' · ');
}

export function renderGeminiQuota(root: HTMLElement, state: GeminiQuotaState, simple = false) {
  root.replaceChildren();
  for (const [id, label] of GEMINI_WINDOWS) {
    const value = state.windows[id], row = document.createElement('div');
    row.className = 'gemini-quota-row';
    const title = document.createElement('span'), percent = document.createElement('strong');
    title.textContent = label;
    percent.textContent = value?.shared ? '与 Gemini 共用' : value?.remainingPercent != null ? remainingLabel(value.remainingPercent) : '未提供';
    row.append(title, percent);
    if (!simple && value && !value.shared) {
      const reset = document.createElement('small');
      reset.textContent = value.resetsAt ? '重置 ' + localTime(value.resetsAt) + (Date.parse(value.resetsAt) <= Date.now() ? ' · 待刷新' : '') : '重置时间未提供';
      row.append(reset);
    }
    root.append(row);
  }
}
