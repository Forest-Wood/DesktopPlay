import { describe, expect, it } from 'vitest';
import { beijingTime, decimalSetting, money } from '../../../src/renderer/format';

describe('renderer display and reminder inputs', () => {
  it('turns an empty threshold off and preserves eight decimal places exactly', () => {
    expect(decimalSetting('  ')).toBeNull();
    expect(decimalSetting('00012.00000001')).toBe('12.00000001');
    expect(decimalSetting('0')).toBe('0.00000000');
    expect(decimalSetting('9007199254740993.12345678')).toBe('9007199254740993.12345678');
  });
  it('rejects negative, exponent, and excessive precision input', () => {
    for (const value of ['-1', 'NaN', '1e2', '1.000000001']) expect(() => decimalSetting(value)).toThrow();
  });
  it('renders two decimal places and keeps unavailable balances distinct from zero', () => {
    expect(money('0.00000000')).toBe('¥0.00');
    expect(money('12.34560000', 'USD')).toBe('$12.35');
    expect(money(null)).toBe('—');
  });
  it('renders the Beijing date across a UTC midnight boundary', () => {
    expect(beijingTime('2026-10-01T17:20:30.000Z')).toBe('10/02 01:20:30');
    expect(beijingTime(undefined)).toBe('尚未更新');
  });
});
