import { describe, expect, it } from 'vitest';
import { planLabel, quotaSlots, remainingLabel, quotaIsStale, resetCountdown, windowLabel } from '../../../src/renderer/quota';
import type { CodexQuotaState } from '../../../src/shared/types';

describe('Codex quota time and availability', () => {
  it('labels real plans and keeps precise remaining percentages', () => {
    expect([null, 'plus', 'PRO', 'business'].map(planLabel)).toEqual(['套餐未知', 'Plus', 'Pro', 'business']);
    expect([100, 99.9, 0.1, 0].map(remainingLabel)).toEqual(['100%', '99.9%', '0.1%', '0%']);
  });
  it('identifies five-hour and weekly windows by duration and preserves other windows', () => {
    const window = (windowMinutes: number) => ({ windowMinutes, usedPercent: 25, remainingPercent: 75, resetsAt: null });
    const base = { id: 'codex', name: 'Codex', planType: 'pro', creditsRemaining: null, unlimitedCredits: false };
    const slots = quotaSlots({ ...base, primary: window(10080), secondary: window(300) }, true);
    expect(slots.map(slot => [slot.label, slot.window?.windowMinutes])).toEqual([['5H', 300], ['每周', 10080]]);
    expect(quotaSlots({ ...base, primary: window(120), secondary: window(10080) }, true).map(slot => [slot.label, slot.window?.windowMinutes ?? null])).toEqual([['5H', null], ['每周', 10080], ['2 小时', 120]]);
  });
  const now = Date.parse('2026-10-02T08:00:00Z');
  it('uses the reported window duration rather than assuming a five-hour window', () => {
    expect(windowLabel(300)).toBe('5 小时');
    expect(windowLabel(10080)).toBe('每周');
    expect(windowLabel(120)).toBe('2 小时');
    expect(windowLabel(25)).toBe('25 分钟');
    expect(windowLabel(null)).toBe('额度窗口');
  });
  it('keeps unknown and expired resets distinct from a future countdown', () => {
    expect(resetCountdown(null, now)).toBe('重置时间未知');
    expect(resetCountdown('invalid', now)).toBe('重置时间未知');
    expect(resetCountdown('2026-10-02T08:00:00Z', now)).toBe('已到重置时间 · 待刷新');
    expect(resetCountdown('2026-10-02T07:00:00Z', now)).toBe('已到重置时间 · 待刷新');
    expect(resetCountdown('2026-10-02T10:03:01Z', now)).toBe('2小时 4分钟后重置');
    expect(resetCountdown('2026-10-04T08:00:00Z', now)).toBe('2天后重置');
  });
  it('labels retained quota as stale after failed requests or missed refreshes', () => {
    const quota: CodexQuotaState = { planType: null, status: 'ready', updatedAt: '2026-10-02T08:00:00Z', available: true, error: null, source: 'codex-app-server', buckets: [{ id: 'a', name: 'Codex', primary: null, secondary: null, planType: null, creditsRemaining: null, unlimitedCredits: false }] };
    expect(quotaIsStale(quota, now)).toBe(false);
    expect(quotaIsStale(quota, now + 181000)).toBe(true);
    expect(quotaIsStale({ ...quota, status: 'error' }, now)).toBe(true);
    expect(quotaIsStale({ ...quota, updatedAt: null }, now)).toBe(true);
    expect(quotaIsStale({ ...quota, buckets: [] }, now)).toBe(false);
  });
});
