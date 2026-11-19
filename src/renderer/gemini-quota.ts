import { GEMINI_WINDOWS } from '../shared/gemini';
import type { GeminiQuotaState } from '../shared/types';
import { localTime, remainingLabel, resetCountdown } from './quota';

export function geminiStatus(state: GeminiQuotaState, demo: boolean) {
  const updated = state.updatedAt ? '上次更新 ' + localTime(state.updatedAt) : '';
  const text = demo ? '演示额度' : state.status === 'error' ? state.error : state.status === 'loading' ? '正在刷新…' : !state.updatedAt ? '尚未读取额度' : '';
  return [text, updated].filter(Boolean).join(' · ');
}

export function geminiStatusChip(state: GeminiQuotaState, demo: boolean): { text: string; status: string } {
  if (demo) return { text: '演示额度', status: 'ready' };
  if (state.status === 'loading') return { text: '正在刷新', status: 'loading' };
  if (state.status === 'error') return { text: '读取异常', status: 'error' };
  if (state.updatedAt) return { text: '已连接 Antigravity', status: 'ready' };
  return { text: '尚未读取', status: 'idle' };
}

export function renderGeminiQuota(root: HTMLElement, state: GeminiQuotaState, simple = false, compact = true) {
  root.replaceChildren();
  for (const [id, label] of GEMINI_WINDOWS) {
    const value = state.windows[id], row = document.createElement('div');
    const remaining = !value?.shared && value?.remainingPercent != null && Number.isFinite(value.remainingPercent)
      ? Math.max(0, Math.min(100, value.remainingPercent)) : null;
    row.className = 'gemini-quota-row';
    row.dataset.state = value?.shared ? 'shared' : remaining === null ? 'missing' : remaining === 0 ? 'empty' : 'ready';
    const title = document.createElement('span'), percent = document.createElement('strong');
    title.textContent = label;
    percent.textContent = value?.shared ? '与 Gemini 共用' : remaining !== null ? remainingLabel(remaining) : '未提供';
    row.append(title, percent);
    if (!compact && remaining !== null) {
      const bar = document.createElement('progress');
      bar.max = 100;
      bar.value = remaining;
      bar.setAttribute('aria-label', `${label}剩余额度`);
      row.append(bar);
    }
    if (!simple) {
      if (value && !value.shared) {
        const reset = document.createElement('small');
        const expired = value.resetsAt ? Date.parse(value.resetsAt) <= Date.now() : false;
        reset.textContent = value.resetsAt
          ? compact
            ? '重置 ' + localTime(value.resetsAt) + (expired ? ' · 待刷新' : '')
            : `${resetCountdown(value.resetsAt)} · 重置 ${localTime(value.resetsAt)}`
          : '重置时间未提供';
        row.append(reset);
      } else if (!compact) {
        const reset = document.createElement('small');
        reset.textContent = value?.shared ? '与 Gemini 周额度共用同一额度池' : state.status === 'loading' ? '正在读取额度与重置时间…' : '尚未获取该窗口的额度数据';
        row.append(reset);
      }
    }
    root.append(row);
  }
}
