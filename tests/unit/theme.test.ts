import { describe, expect, it } from 'vitest';
import { DEFAULT_BUBBLE_PROFILES } from '../../src/shared/bubble-settings';
import { AA_MINIMUM, DEFAULT_THEME, THEME_PRESETS, contrastRatio, deriveTheme, hexToOklch, normalizeTheme, oklchToHex, themeAccent } from '../../src/shared/theme';
import type { ThemeSettings } from '../../src/shared/types';

describe('theme colors', () => {
  it('round-trips common sRGB colors through OKLCH', () => {
    for (const color of ['#000000', '#ffffff', '#808080', '#ff0000', '#0000ff', THEME_PRESETS.sage]) {
      expect(oklchToHex(hexToOklch(color))).toBe(color);
    }
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(AA_MINIMUM);
  });

  it('darkens a pale input and keeps the button, body and bubble text at AA', () => {
    const theme: ThemeSettings = { ...DEFAULT_THEME, preset: 'custom', accent: '#fff1a8', intensity: 1.4 };
    const palette = deriveTheme(theme, 'whale');
    expect(palette.accentAdjusted).toBe(true);
    expect(palette.requested).toBe(theme.accent);
    expect(hexToOklch(palette.settings['--accent']).lightness).toBeLessThan(hexToOklch(theme.accent).lightness);
    expect(Math.min(palette.buttonRatio, palette.bodyRatio, palette.bubbleRatio)).toBeGreaterThanOrEqual(AA_MINIMUM);
  });

  it('derives every preset, including persona colors, with AA and stable status tokens', () => {
    for (const [preset, accent] of Object.entries(THEME_PRESETS)) {
      const palette = deriveTheme(normalizeTheme({ ...DEFAULT_THEME, preset, accent }), 'whale');
      expect(Math.min(palette.buttonRatio, palette.bodyRatio, palette.bubbleRatio)).toBeGreaterThanOrEqual(AA_MINIMUM);
      for (const status of ['--ok', '--info', '--warn', '--err', '--off']) expect(palette.settings).not.toHaveProperty(status);
    }
    const persona = normalizeTheme({ ...DEFAULT_THEME, preset: 'persona' });
    expect(themeAccent(persona, 'dragon')).toBe(DEFAULT_BUBBLE_PROFILES.dragon.style.border);
    expect(deriveTheme(persona, 'whale').settings['--accent']).not.toBe(deriveTheme(persona, 'gemini').settings['--accent']);
  });

  it('changes zone colors and intensity independently of the requested main color', () => {
    const base = deriveTheme(DEFAULT_THEME, 'whale');
    const override = deriveTheme({ ...DEFAULT_THEME, overrides: { sidebar: '#74a6e7', stage: '#812f91', bubble: '#ed8244' } }, 'whale');
    expect(override.settings['--accent']).toBe(base.settings['--accent']);
    expect(override.settings['--nav']).not.toBe(base.settings['--nav']);
    expect(override.settings['--theme-stage-tint']).not.toBe(base.settings['--theme-stage-tint']);
    expect(override.pet['--theme-pet-bubble-bg']).not.toBe(base.pet['--theme-pet-bubble-bg']);
    expect(deriveTheme({ ...DEFAULT_THEME, intensity: .6 }, 'whale').settings['--selected']).not.toBe(base.settings['--selected']);
  });
});

describe('theme validation', () => {
  it('normalizes valid hex and rejects malformed or unexpected fields', () => {
    const custom = { ...DEFAULT_THEME, preset: 'custom', accent: '#ABCDEF', overrides: { stage: '#FF9500' } };
    expect(normalizeTheme(custom)).toMatchObject({ accent: '#abcdef', overrides: { stage: '#ff9500' } });
    const invalid = [
      { ...custom, accent: '#aabbcc\n' },
      { ...custom, intensity: 1.5 },
      { ...custom, texture: 'photo' },
      { ...custom, applyToPet: 'yes' },
      { ...DEFAULT_THEME, accent: '#ffffff' },
      { ...custom, overrides: JSON.parse('{"__proto__":"#0a0a0a"}') },
      { ...custom, extra: 'unknown' },
    ];
    for (const theme of invalid) expect(() => normalizeTheme(theme)).toThrow();
  });
});
