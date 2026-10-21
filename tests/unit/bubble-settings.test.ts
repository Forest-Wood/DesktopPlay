import { describe, expect, it } from 'vitest';
import { DEFAULT_BUBBLE_PROFILES, PERSONAS, SCENARIOS, resolveBubble, validateBubbleProfiles } from '../../src/shared/bubble-settings';

describe('persona bubble configuration', () => {
  it('resolves category overrides without changing another source or persona', () => {
    const profiles = structuredClone(DEFAULT_BUBBLE_PROFILES);
    profiles.dragon.style.ink = '#123456'; profiles.dragon.timing.durationSeconds = 8;
    profiles.dragon.rules['completion-deepseek-harness'].style = { ink: '#abcdef' };
    profiles.dragon.rules['completion-deepseek-harness'].timing = { hoverDelaySeconds: 4 };
    expect(resolveBubble(profiles, 'dragon', 'completion-deepseek-harness')).toMatchObject({ style: { ink: '#abcdef' }, timing: { durationSeconds: 8, hoverDelaySeconds: 4 }, soundEnabled: false });
    expect(resolveBubble(profiles, 'dragon', 'completion-codex').style.ink).toBe('#123456');
    expect(profiles.whale.style.ink).toBe(DEFAULT_BUBBLE_PROFILES.whale.style.ink);
  });
  it('contains all scenarios with distinct completion text and silent audio defaults', () => {
    validateBubbleProfiles(DEFAULT_BUBBLE_PROFILES);
    for (const persona of PERSONAS) {
      expect(Object.keys(DEFAULT_BUBBLE_PROFILES[persona].rules)).toHaveLength(SCENARIOS.length);
      const completion = Object.entries(DEFAULT_BUBBLE_PROFILES[persona].rules).filter(([key]) => key.startsWith('completion-')).map(([, rule]) => rule);
      expect(new Set(completion.map(rule => rule.message)).size).toBe(3); expect(completion.every(rule => !rule.soundEnabled && rule.enabled)).toBe(true);
    }
  });
  it('rejects invalid ranges, CSS injection, unknown fields, blank completion text and accessor properties', () => {
    const mutations = [
      (p: typeof DEFAULT_BUBBLE_PROFILES) => { p.whale.style.fontScale = 2; },
      (p: typeof DEFAULT_BUBBLE_PROFILES) => { p.gpt.timing.durationSeconds = 0; },
      (p: typeof DEFAULT_BUBBLE_PROFILES) => { p.dragon.style.background = 'url(file:///private)'; },
      (p: typeof DEFAULT_BUBBLE_PROFILES) => { p.whale.rules['completion-codex'].message = '  '; },
      (p: typeof DEFAULT_BUBBLE_PROFILES) => { Object.assign(p.whale.rules.update.style, { unexpected: true }); },
      (p: typeof DEFAULT_BUBBLE_PROFILES) => { Object.defineProperty(p.whale.style, 'ink', { get() { throw new Error('getter must not run'); } }); },
    ];
    for (const mutate of mutations) { const profiles = structuredClone(DEFAULT_BUBBLE_PROFILES); mutate(profiles); expect(() => validateBubbleProfiles(profiles)).toThrow(); }
  });
});
