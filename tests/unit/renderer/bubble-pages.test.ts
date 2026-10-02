import { describe, expect, it } from 'vitest';
import type { AppState } from '../../../src/shared/types';
import { nextPage, pageCount, summaryText, usageStatus } from '../../../src/renderer/bubble-pages';

const state = (patch: Partial<AppState> = {}) => ({ activePet: 'deepseek', status: 'ready', balance: null, ledger: { today: null, history: [] }, codex: { buckets: [], updatedAt: null, status: 'idle' }, ...patch } as AppState);
describe('speech bubble pages and local reports', () => {
  it('cycles every configured phrase exactly once, including an empty phrase list', () => {
    const phrases = ['一', '二'];
    expect(pageCount(phrases)).toBe(4);
    expect([0, 1, 2, 3].map(page => nextPage(page, phrases))).toEqual([1, 2, 3, 0]);
    expect(nextPage(1, [])).toBe(0);
  });
  it('does not infer balances or windows when data is missing', () => {
    expect(summaryText(state())).toContain('余额未知');
    expect(summaryText(state({ activePet: 'gpt' }))).toContain('额度未知');
  });
  it('reports observed spending without describing it as total daily consumption', () => {
    const account = state({ balance: { total: '25.01', currency: 'CNY', observedAt: new Date().toISOString(), granted: '0', toppedUp: '25.01', isAvailable: true }, ledger: { history: [], today: { date: '2026-10-02', currency: 'CNY', spent: '2', increased: '0', startedAt: '' } }, status: 'error' });
    expect(summaryText(account)).toContain('今日已观测消费 ¥2.00');
    expect(summaryText(account)).toContain('最近数据');
    expect(usageStatus(account, false)).toContain('展示最近数据');
  });
  it('summarizes the lowest reported quota and identifies retained data', () => {
    const account = state({ activePet: 'gpt', codex: { planType: null, status: 'error', updatedAt: new Date().toISOString(), available: true, error: 'offline', source: 'codex-app-server', buckets: [{ id: 'a', name: 'A', planType: null, creditsRemaining: null, unlimitedCredits: false, primary: { usedPercent: 12, remainingPercent: 88, windowMinutes: 300, resetsAt: null }, secondary: { usedPercent: 93, remainingPercent: 7, windowMinutes: 10080, resetsAt: null } }] } });
    expect(summaryText(account)).toContain('最近数据：最低剩余额度 7%');
    expect(summaryText(account)).toContain('重置时间');
  });
});
