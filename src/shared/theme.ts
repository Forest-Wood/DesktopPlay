import { DEFAULT_BUBBLE_PROFILES } from './bubble-settings';
import type { PetPersona, ThemePresetId, ThemeSettings, ThemeTexture } from './types';

export const THEME_PRESETS: Readonly<Record<Exclude<ThemePresetId, 'persona'>, string>> = {
  sage: '#28624f', mint: '#2f7d6d', sea: '#3a5f9e', starlight: '#6b4f99', sakura: '#a4486a', apricot: '#9a5b23', ink: '#3d4a52',
};
export const THEME_TEXTURES: readonly ThemeTexture[] = ['none', 'dots', 'grid', 'stars'];
export const THEME_ZONES = ['sidebar', 'stage', 'bubble'] as const;
export type ThemeZone = typeof THEME_ZONES[number];
export const DEFAULT_THEME: Readonly<ThemeSettings> = {
  preset: 'sage', accent: THEME_PRESETS.sage, overrides: {}, texture: 'none', intensity: 1, applyToSettings: true, applyToPet: false,
};
export const AA_MINIMUM = 4.5;

export function isThemeColor(value: unknown): value is string {
  return typeof value === 'string' && value.length === 7 && /^#[0-9a-f]{6}$/i.test(value);
}

function themeFields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) throw new Error('主题设置包含无效字段。');
  return value as Record<string, unknown>;
}

export function normalizeTheme(value: unknown): ThemeSettings {
  const { preset, accent, overrides, texture, intensity, applyToSettings, applyToPet } = themeFields(value, Object.keys(DEFAULT_THEME));
  if (typeof preset !== 'string' || !(preset === 'custom' || preset === 'persona' || Object.hasOwn(THEME_PRESETS, preset))
    || !isThemeColor(accent) || !THEME_TEXTURES.includes(texture as ThemeTexture)
    || typeof intensity !== 'number' || !Number.isFinite(intensity) || intensity < .6 || intensity > 1.4
    || typeof applyToSettings !== 'boolean' || typeof applyToPet !== 'boolean') throw new Error('主题色、纹理或强度设置无效。');
  const color = accent.toLowerCase();
  if (preset !== 'custom' && color !== (preset === 'persona' ? DEFAULT_THEME.accent : THEME_PRESETS[preset as keyof typeof THEME_PRESETS])) {
    throw new Error('主题主色与所选预设不符。');
  }
  const zones: ThemeSettings['overrides'] = {};
  for (const [zone, hex] of Object.entries(themeFields(overrides, THEME_ZONES))) {
    if (!isThemeColor(hex)) throw new Error('分区颜色须为六位 HEX。');
    zones[zone as ThemeZone] = hex.toLowerCase();
  }
  return { preset: preset as ThemeSettings['preset'], accent: color, overrides: zones, texture: texture as ThemeTexture, intensity, applyToSettings, applyToPet };
}

export function themeAccent(theme: ThemeSettings, persona: PetPersona): string {
  return theme.preset === 'persona' ? DEFAULT_BUBBLE_PROFILES[persona].style.border : theme.accent;
}

type RGB = [number, number, number];
type OKLCH = { lightness: number; chroma: number; hue: number };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const linear = (value: number) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const srgb = (value: number) => value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055;
const channels = (hex: string): RGB => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255) as RGB;

// D65 conversion using the combined linear sRGB and Oklab matrices.
export function hexToOklch(hex: string): OKLCH {
  const [r, g, b] = channels(hex).map(linear);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const a = 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s;
  const y = .0259040371 * l + .7827717662 * m - .8086757660 * s;
  return { lightness: .2104542553 * l + .7936177850 * m - .0040720468 * s, chroma: Math.hypot(a, y), hue: Math.atan2(y, a) };
}

function toLinearRgb(lightness: number, chroma: number, hue: number): RGB {
  const a = chroma * Math.cos(hue), b = chroma * Math.sin(hue);
  const l = (lightness + .3963377774 * a + .2158037573 * b) ** 3;
  const m = (lightness - .1055613458 * a - .0638541728 * b) ** 3;
  const s = (lightness - .0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
    -.0041960863 * l - .7034186147 * m + 1.7076147010 * s];
}

export function oklchToHex({ lightness, chroma, hue }: OKLCH): string {
  let rgb = toLinearRgb(lightness, chroma, hue);
  const inGamut = (color: RGB) => color.every(channel => channel >= -1e-7 && channel <= 1 + 1e-7);
  if (!inGamut(rgb)) {
    let low = 0, high = chroma;
    rgb = toLinearRgb(lightness, 0, hue);
    for (let step = 0; step < 18; step++) {
      const candidate = (low + high) / 2;
      const color = toLinearRgb(lightness, candidate, hue);
      if (inGamut(color)) { low = candidate; rgb = color; }
      else high = candidate;
    }
  }
  return '#' + rgb.map(value => Math.round(srgb(clamp(value)) * 255).toString(16).padStart(2, '0')).join('');
}

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map(linear);
  return .2126 * r + .7152 * g + .0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

const minimumContrast = (color: string, backgrounds: string[]) => Math.min(...backgrounds.map(bg => contrastRatio(color, bg)));
function readable(color: OKLCH, backgrounds: string[]) {
  const requested = oklchToHex(color);
  if (minimumContrast(requested, backgrounds) >= AA_MINIMUM) return requested;
  let best = '#000000', low = 0, high = color.lightness;
  for (let step = 0; step < 16; step++) {
    const lightness = (low + high) / 2;
    const candidate = oklchToHex({ ...color, lightness });
    if (minimumContrast(candidate, backgrounds) >= AA_MINIMUM) { best = candidate; low = lightness; }
    else high = lightness;
  }
  return best;
}

export function deriveTheme(theme: ThemeSettings, persona: PetPersona) {
  const requested = themeAccent(theme, persona);
  const main = hexToOklch(requested);
  const sidebar = hexToOklch(theme.overrides.sidebar ?? requested);
  const stage = hexToOklch(theme.overrides.stage ?? requested);
  const bubble = hexToOklch(theme.overrides.bubble ?? requested);
  const tint = (color: OKLCH, lightness: number, chroma: number) => oklchToHex({
    ...color, lightness: 1 - (1 - lightness) * theme.intensity, chroma: color.chroma * chroma * theme.intensity,
  });
  const nav = tint(sidebar, .975, .15);
  const stageTint = tint(stage, .952, .26), stageRing = tint(stage, .90, .37);
  const soft = tint(main, .969, .23), selected = tint(main, .93, .27), surfaceAlt = tint(main, .978, .12);
  const white = '#ffffff';
  const surfaces = [white, nav, stageTint, surfaceAlt, soft, selected];
  const accent = readable(main, surfaces);
  const strong = readable({ ...main, lightness: Math.max(0, hexToOklch(accent).lightness - .08) }, surfaces);
  const ink = readable({ ...main, lightness: .34, chroma: main.chroma * .32 }, surfaces);
  const muted = readable({ ...main, lightness: .48, chroma: main.chroma * .22 }, surfaces);
  const bubbleBg = tint(bubble, .963, .22), bubbleRing = tint(bubble, .90, .42);
  const bubbleInk = readable({ ...bubble, lightness: .36, chroma: bubble.chroma * .56 }, [bubbleBg, bubbleRing]);
  const bubbleBorder = readable({ ...bubble, lightness: Math.min(.60, bubble.lightness) }, [bubbleBg]);
  return {
    requested,
    accentAdjusted: accent !== requested,
    buttonRatio: contrastRatio(white, accent),
    bodyRatio: minimumContrast(ink, surfaces),
    bubbleRatio: contrastRatio(bubbleInk, bubbleBg),
    settings: {
      '--accent': accent, '--accent-strong': strong, '--accent-on-strong': white, '--accent-soft': soft, '--selected': selected,
      '--nav': nav, '--surface-alt': surfaceAlt, '--ink': ink, '--muted': muted, '--line': tint(main, .92, .16),
      '--line-strong': tint(main, .80, .35), '--selection-border': tint(main, .69, .67),
      '--theme-stage-tint': stageTint, '--theme-stage-ring': stageRing,
    },
    pet: {
      '--theme-pet-bubble-bg': bubbleBg, '--theme-pet-bubble-ink': bubbleInk,
      '--theme-pet-bubble-border': bubbleBorder, '--theme-pet-bubble-ring': bubbleRing,
    },
  };
}
