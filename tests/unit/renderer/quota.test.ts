import { describe, expect, it } from 'vitest';
import { planLabel, quotaSlots, remainingLabel, quotaIsStale, resetCountdown, windowLabel, resetCreditExpiry, resetCreditsView } from '../../../src/renderer/quota';
import type { CodexQuotaState } from '../../../src/shared/types';

describe('Codex quota time and availability', () => {
  const resetQuota = (resetCredits: CodexQuotaState['resetCredits']): CodexQuotaState => ({ resetCredits, planType: null, status: 'ready', updatedAt: '2026-10-02T08:00:00Z', available: true, error: null, source: 'codex-app-server', buckets: [] });
  it('keeps unknown, zero, partial details and count-only snapshots distinct', () => {
    expect(resetCreditsView(resetQuota(null), now).count).toBe('重置卡：未提供');
    expect(resetCreditsView(resetQuota({ availableCount: 0, credits: [] }), now)).toMatchObject({ count: '重置卡 0 张', deadline: '', note: '' });
    expect(resetCreditsView(resetQuota({ availableCount: 2, credits: null }), now)).toMatchObject({ count: '重置卡 2 张', deadline: '截止时间未提供', note: '接口仅提供张数，截止时间未提供。' });
    const quota = resetQuota({ availableCount: 8, credits: [{ id: 'late', status: 'available', expiresAt: '2027-01-01T00:00:00Z' }, { id: 'first', status: 'available', expiresAt: '2026-12-31T00:00:00Z' }] });
    const view = resetCreditsView(quota, now);
    expect(view.count).toBe('重置卡 8 张'); expect(view.rows[0].id).toBe('first'); expect(view.note).toContain('明细不完整'); expect(view.deadline).toContain('最近已知截止');
    expect(resetCreditsView({ ...quota, status: 'error' }, now).count).toContain('待刷新');
  });
  it('formats complete cutoff instants with explicit timezone and keeps no expiry distinct', () => {
    const credit = { id: 'a', status: 'available' as const, expiresAt: '2026-10-02T08:09:10Z' };
    const shanghai = resetCreditExpiry(credit, now, 'Asia/Shanghai');
    expect(shanghai).toContain('2026/10/02'); expect(shanghai).toContain('16:09:10'); expect(shanghai).toContain('GMT+08:00');
    const utc = resetCreditExpiry(credit, now, 'UTC');
    expect(utc).toContain('08:09:10'); expect(utc).toContain('GMT');
    expect(resetCreditExpiry(credit, now + 86400000)).toContain('已到期');
    expect(resetCreditExpiry({ ...credit, expiresAt: null }, now)).toBe('无到期限制');
    expect(resetCreditExpiry({ ...credit, expiresAt: undefined }, now)).toBe('截止时间未提供');
    expect(resetCreditsView(resetQuota({ availableCount: 1, credits: [{ ...credit, expiresAt: null }] }), now).deadline).toBe('无到期限制');
    expect(resetCreditsView(resetQuota({ availableCount: 2, credits: [{ ...credit, expiresAt: null }] }), now).deadline).toBe('截止时间未提供');
  });
  it('labels real plans and keeps precise remaining percentages', () => {
    expect([null, 'plus', 'PRO', 'business'].map(planLabel)).toEqual(['套餐未知', 'Plus', 'Pro', 'business']);
    expect([100, 99.9, 0.1, 0].map(remainingLabel)).toEqual(['100%', '99.9%', '0.1%', '0%']);
  });
  it('identifies five-hour and weekly windows by duration and preserves other windows', () => {
    const window = (windowMinutes: number) => ({ windowMinutes, usedPercent: 25, remainingPercent: 75, resetsAt: null });
    const base = { id: 'codex', name: 'Codex', planType: 'pro', creditsRemaining: null, unlimitedCredits: false };
    const slots = quotaSlots({ ...base, primary: window(10080), secondary: window(300) }, true);
    expect(slots.map(slot => [slot.label, slot.window?.windowMinutes])).toEqual([['每周', 10080], ['5H', 300]]);
    expect(quotaSlots({ ...base, primary: window(120), secondary: window(10080) }, true).map(slot => [slot.label, slot.window?.windowMinutes ?? null])).toEqual([['每周', 10080], ['2 小时', 120]]);
    for (const planType of ['pro', 'plus', null]) {
      expect(quotaSlots({ ...base, planType, primary: window(10080), secondary: null }, true).map(slot => slot.label)).toEqual(['每周']);
    }
    expect(quotaSlots({ ...base, primary: window(300), secondary: null }, true).map(slot => [slot.label, slot.window?.windowMinutes ?? null])).toEqual([['每周', null], ['5H', 300]]);
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
    const quota: CodexQuotaState = { resetCredits: null, planType: null, status: 'ready', updatedAt: '2026-10-02T08:00:00Z', available: true, error: null, source: 'codex-app-server', buckets: [{ id: 'a', name: 'Codex', primary: null, secondary: null, planType: null, creditsRemaining: null, unlimitedCredits: false }] };
    expect(quotaIsStale(quota, now)).toBe(false);
    expect(quotaIsStale(quota, now + 181000)).toBe(true);
    expect(quotaIsStale({ ...quota, status: 'error' }, now)).toBe(true);
    expect(quotaIsStale({ ...quota, updatedAt: null }, now)).toBe(true);
    expect(quotaIsStale({ ...quota, buckets: [] }, now)).toBe(false);
  });
});
