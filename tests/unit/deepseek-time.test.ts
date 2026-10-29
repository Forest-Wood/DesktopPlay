import { describe, expect, it } from 'vitest';
import { dateInZone, deepseekPeriod, deepseekBubblePeriod, localBalanceTime, zoneLabel } from '../../src/shared/deepseek-time';

describe('DeepSeek official instants displayed in computer time', () => {
  it.each([
    ['2026-10-29T08:59:59+08:00', '2026-10-29T09:00:00+08:00', 'peak'],
    ['2026-10-29T09:00:00+08:00', '2026-10-29T12:00:00+08:00', 'off-peak'],
    ['2026-10-29T12:00:00+08:00', '2026-10-29T14:00:00+08:00', 'peak'],
    ['2026-10-29T14:00:00+08:00', '2026-10-29T18:00:00+08:00', 'off-peak'],
    ['2026-10-30T18:00:00+08:00', '2026-11-02T09:00:00+08:00', 'peak'],
    ['2026-10-01T09:00:00+08:00', '2026-10-08T09:00:00+08:00', 'peak'],
    ['2026-02-13T18:00:00+08:00', '2026-02-24T09:00:00+08:00', 'peak'],
    ['2026-12-31T17:30:00+08:00', '2026-12-31T18:00:00+08:00', 'off-peak'],
  ])('finds the next actual transition after %s', (now, next, status) => {
    for (const zone of ['Asia/Shanghai', 'America/Los_Angeles']) expect(deepseekPeriod(new Date(now), zone).nextTransition).toEqual({ at: new Date(next).toISOString(), status });
  });
  it('stops at unknown calendar boundaries', () => {
    for (const now of ['2026-12-31T18:00:00+08:00', '2027-01-04T09:00:00+08:00']) {
      expect(deepseekPeriod(new Date(now)).nextTransition).toBeNull();
      expect(deepseekBubblePeriod(new Date(now)).next).toBe('下次切换待核实');
    }
  });
  it('formats a future transition with its own daylight saving offset', () => {
    const bubble = deepseekBubblePeriod(new Date('2026-10-30T18:00:00+08:00'), 'America/Los_Angeles');
    expect(bubble.next).toBe('下次高峰：11/01 17:00');
    expect(bubble.title).toContain('UTC-07:00'); expect(bubble.title).toContain('UTC-08:00');
    expect(bubble.title).toContain('2026/11/01');
  });
  it.each([
    ['2026-10-27T00:59:59Z', 'off-peak'], ['2026-10-27T01:00:00Z', 'peak'],
    ['2026-10-27T03:59:59Z', 'peak'], ['2026-10-27T04:00:00Z', 'off-peak'],
    ['2026-10-27T06:00:00Z', 'peak'], ['2026-10-27T10:00:00Z', 'off-peak'],
    ['2026-10-10T01:00:00Z', 'off-peak'], // Compensating Saturday workday.
    ['2026-10-01T01:00:00Z', 'off-peak'], // Public holiday.
    ['2026-02-23T06:00:00Z', 'off-peak'],
    ['2027-01-04T01:00:00Z', 'unknown'], ['2027-01-03T01:00:00Z', 'off-peak'],
  ])('%s is %s regardless of the display zone', (instant, status) => {
    for (const zone of ['Asia/Shanghai', 'UTC', 'America/Los_Angeles', 'Asia/Kolkata']) {
      expect(deepseekPeriod(new Date(instant), zone).status).toBe(status);
    }
  });
  it('converts windows with local dates and adapts to daylight saving', () => {
    const summer = deepseekPeriod(new Date('2026-10-27T02:00:00Z'), 'America/Los_Angeles');
    expect(summer.windows).toContain('10/26'); expect(summer.windows).toContain('18:00');
    expect(summer.zone).toContain('UTC-07:00');
    const winter = deepseekPeriod(new Date('2026-11-03T02:00:00Z'), 'America/Los_Angeles');
    expect(winter.windows).toContain('17:00'); expect(winter.zone).toContain('UTC-08:00');
    expect(deepseekPeriod(new Date('2027-01-04T02:00:00Z')).note).toBe('节假日待核实');
  });
  it('uses Beijing dates for official weekends even on a different local date', () => {
    const period = deepseekPeriod(new Date('2026-10-26T01:00:00Z'), 'America/Los_Angeles');
    expect(period.status).toBe('peak'); expect(period.windows).toContain('10/25');
  });
  it('formats local date and balance time without retaining an old timezone formatter', () => {
    const instant = new Date('2026-10-27T00:30:00Z');
    expect(dateInZone(instant, 'America/Los_Angeles')).toBe('2026-10-26');
    expect(dateInZone(instant, 'Asia/Shanghai')).toBe('2026-10-27');
    expect(localBalanceTime(instant.toISOString(), 'Asia/Kolkata')).toContain('06:00:00');
    expect(zoneLabel(instant, 'Asia/Kolkata')).toContain('UTC+05:30');
    expect(localBalanceTime(undefined)).toBe('尚未更新');
  });
});
