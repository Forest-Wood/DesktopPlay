import type { AppState } from '../shared/types';
import { money } from './format';
import { quotaIsStale } from './quota';

export const pageCount = (phrases: string[]) => 2 + phrases.length;
export const nextPage = (page: number, phrases: string[]) => (page + 1) % pageCount(phrases);

export function usageStatus(state: AppState, demo: boolean): string {
  if (demo) return '演示余额 · 非真实账户';
  if (state.status === 'loading') return state.balance ? '正在刷新 · 展示最近数据' : '正在读取余额…';
  if (state.status === 'error') return state.balance ? '连接异常 · 展示最近数据' : '连接异常 · 余额未知';
  if (state.status === 'unconfigured') return state.balance ? '未连接账户 · 展示最近数据' : '请在设置中连接账户';
  if (state.balance && Date.now() - Date.parse(state.balance.observedAt) > 180000) return '最近余额 · 数据待更新';
  return '今日消费仅统计已观测变化';
}

export function summaryText(state: AppState): string {
  if (state.activePet === 'gpt') {
    const values = state.codex.buckets.flatMap(bucket => [bucket.primary, bucket.secondary]).filter(window => window && Number.isFinite(window.remainingPercent)).map(window => window!.remainingPercent);
    if (!values.length) return '额度未知，请连接本机 Codex 后刷新。';
    const remaining = Math.max(0, Math.min(100, Math.min(...values)));
    const prefix = quotaIsStale(state.codex) ? '最近数据：' : '';
    return `${prefix}最低剩余额度 ${Number(remaining.toFixed(1))}%。${remaining <= 10 ? '可以休息一下，留意重置时间。' : remaining <= 30 ? '剩余额度较少，留意使用节奏。' : '按自己的节奏继续吧。'}`;
  }
  if (!state.balance) return '余额未知，请连接账户后刷新。';
  const spent = state.ledger.today;
  return `余额 ${money(state.balance.total, state.balance.currency)}。${spent ? `今日已观测消费 ${money(spent.spent, spent.currency)}。` : '今日尚无消费观测记录。'}${state.status === 'error' ? '当前展示最近数据。' : ''}`;
}
