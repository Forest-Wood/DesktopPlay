import { petPersona } from '../shared/bubble-settings';
import { DEFAULT_THEME, deriveTheme } from '../shared/theme';
import type { AppState, ThemeTexture } from '../shared/types';

export const THEME_PATTERNS: Record<ThemeTexture, { image: string; size: string }> = {
  none: { image: 'none', size: 'auto' },
  dots: { image: 'radial-gradient(circle at 2px 2px, color-mix(in srgb, var(--accent) 12%, transparent) 1px, transparent 1.3px)', size: '12px 12px' },
  grid: { image: 'linear-gradient(to right, color-mix(in srgb, var(--accent) 8%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--accent) 8%, transparent) 1px, transparent 1px)', size: '14px 14px' },
  stars: { image: 'radial-gradient(ellipse 5px 1px at 7px 7px, color-mix(in srgb, var(--accent) 16%, transparent), transparent), radial-gradient(ellipse 1px 5px at 7px 7px, color-mix(in srgb, var(--accent) 16%, transparent), transparent), radial-gradient(circle at 21px 18px, color-mix(in srgb, var(--accent) 13%, transparent) 1px, transparent 1.5px)', size: '27px 26px' },
};

export function applyThemeVariables(target: HTMLElement, values: Record<string, string>, enabled = true) {
  for (const [property, value] of Object.entries(values)) {
    if (enabled) target.style.setProperty(property, value);
    else target.style.removeProperty(property);
  }
}

const DEFAULT_PET_VARIABLES = deriveTheme(DEFAULT_THEME, 'whale').pet;

export function mountPetTheme(canvas: HTMLElement) {
  let last = '';
  return (state: AppState) => {
    const theme = state.settings.theme, persona = petPersona(state);
    const key = theme.applyToPet ? JSON.stringify([theme, persona]) : 'off';
    if (last === key) return;
    last = key;
    applyThemeVariables(canvas, theme.applyToPet ? deriveTheme(theme, persona).pet : DEFAULT_PET_VARIABLES, theme.applyToPet);
  };
}
