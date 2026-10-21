import type { BubbleStyle } from '../shared/types';

const fonts = { system: 'system-ui, "Microsoft YaHei", sans-serif', yahei: '"Microsoft YaHei", sans-serif', dengxian: 'DengXian, "Microsoft YaHei", sans-serif', kaiti: 'KaiTi, "Microsoft YaHei", serif' };
/** Shared by the live pet and the editor's real pet preview. */
export function applyBubbleStyle(element: HTMLElement, style: BubbleStyle) {
  const color = style.background;
  element.style.setProperty('--bubble-bg', `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${style.backgroundOpacity})`);
  element.style.setProperty('--bubble-ink', style.ink);
  element.style.setProperty('--bubble-border', style.border);
  element.style.setProperty('--bubble-ring', style.ring);
  element.style.setProperty('--bubble-font-scale', String(style.fontScale));
  element.style.fontFamily = fonts[style.font];
}
