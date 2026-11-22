import type { BubbleStyle } from '../shared/types';

const fonts = { system: 'system-ui, "Microsoft YaHei", sans-serif', yahei: '"Microsoft YaHei", sans-serif', dengxian: 'DengXian, "Microsoft YaHei", sans-serif', kaiti: 'KaiTi, "Microsoft YaHei", serif' };
/** Keep inherited colors in CSS and apply the user's base and scenario colors per field. */
export function applyBubbleStyle(element: HTMLElement, style: BubbleStyle, base: BubbleStyle, defaults: BubbleStyle, overrides: Partial<BubbleStyle>) {
  const stockBase = (Object.keys(defaults) as (keyof BubbleStyle)[]).every(key => base[key] === defaults[key]);
  element.toggleAttribute('data-theme-bubble', stockBase);
  const explicit = (key: keyof BubbleStyle) => Object.hasOwn(overrides, key) || base[key] !== defaults[key];
  const color = explicit('background') ? style.background : 'var(--bubble-bg-source)';
  if (explicit('background') || style.backgroundOpacity !== 1) {
    element.style.setProperty('--bubble-bg', style.backgroundOpacity === 1 ? color : `color-mix(in srgb, ${color} ${style.backgroundOpacity * 100}%, transparent)`);
  } else element.style.removeProperty('--bubble-bg');
  for (const key of ['ink', 'border', 'ring'] as const) {
    const property = `--bubble-${key}`;
    if (explicit(key)) element.style.setProperty(property, style[key]);
    else element.style.removeProperty(property);
  }
  element.style.setProperty('--bubble-font-scale', String(style.fontScale));
  element.style.fontFamily = fonts[style.font];
}
