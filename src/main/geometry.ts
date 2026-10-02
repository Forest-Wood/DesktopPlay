import { CHARACTER_SIZE, getPetLayout, PET_HEIGHT, PET_WIDTH } from '../shared/pet-layout';
import type { Rect } from '../shared/pet-layout';
import type { BubblePlacement } from '../shared/types';
export { PET_HEIGHT, PET_WIDTH } from '../shared/pet-layout';
export type { Rect } from '../shared/pet-layout';

export interface Orientation { flipped: boolean; verticalFlipped: boolean; bubblePlacement: BubblePlacement }
export interface Point { x: number; y: number }

export function characterOrigin(bounds: Rect, orientation: Orientation): Point {
  const character = getPetLayout(orientation.flipped, orientation.bubblePlacement).character;
  const scale = bounds.width / PET_WIDTH;
  return { x: bounds.x + character.x * scale, y: bounds.y + character.y * scale };
}

/** Layout changes preserve the visible character, not the surrounding transparent window. */
export function placeCharacter(origin: Point, area: Rect, requestedScale: number, previous: Orientation, snap: boolean) {
  const size = petSize(fitScale(requestedScale, area));
  const scale = size.width / PET_WIDTH;
  const point = { ...origin };
  if (snap) {
    const right = area.x + area.width - CHARACTER_SIZE * scale;
    const bottom = area.y + area.height - (CHARACTER_SIZE + 4) * scale;
    if (Math.abs(point.x - area.x) <= 24) point.x = area.x;
    else if (Math.abs(point.x - right) <= 24) point.x = right;
    if (Math.abs(point.y - area.y) <= 24) point.y = area.y + 4 * scale;
    else if (Math.abs(point.y - bottom) <= 24) point.y = bottom;
  }
  const center = point.x + CHARACTER_SIZE * scale / 2;
  const middle = area.x + area.width / 2;
  const flipped = center < middle - 24 ? true : center > middle + 24 ? false : previous.flipped;
  const topSpace = point.y - area.y;
  const verticalFlipped = topSpace <= (previous.verticalFlipped ? 48 : 24);
  const aboveOffset = getPetLayout(flipped, 'above').character.y * scale;
  let bubblePlacement: BubblePlacement = previous.bubblePlacement;
  if (verticalFlipped || topSpace < aboveOffset) bubblePlacement = 'below';
  else if (topSpace >= aboveOffset + (previous.bubblePlacement === 'below' ? 16 : 0)) bubblePlacement = 'above';
  // Near the bottom there is no room below, even if the previous layout was below.
  const belowHeight = size.height - getPetLayout(flipped, 'below').character.y * scale;
  if (!verticalFlipped && area.y + area.height - point.y < belowHeight && topSpace >= aboveOffset) bubblePlacement = 'above';
  const orientation: Orientation = { flipped, verticalFlipped, bubblePlacement };
  const offset = getPetLayout(flipped, bubblePlacement).character;
  const bounds = clampToArea({ ...size, x: point.x - offset.x * scale, y: point.y - offset.y * scale }, area);
  return { bounds, ...orientation };
}
export function fitScale(requested: number, area: Rect): number {
  // Both directional layouts must overlap around their switching thresholds;
  // merely fitting one 360×440 window leaves unreachable gaps at large scales.
  return Math.min(requested, area.width / PET_WIDTH, area.height / PET_HEIGHT,
    Math.max(0.01, (area.width - 48) / 500), Math.max(0.01, (area.height - 16) / 652));
}
export function petSize(scale: number): { width: number; height: number } {
  return { width: Math.round(PET_WIDTH * scale), height: Math.round(PET_HEIGHT * scale) };
}
export function clampToArea(bounds: Rect, area: Rect): Rect {
  return {
    ...bounds,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + Math.max(0, area.width - bounds.width)))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + Math.max(0, area.height - bounds.height)))),
  };
}
export function snapToArea(bounds: Rect, area: Rect, enabled: boolean, wasFlipped: boolean): { bounds: Rect; flipped: boolean } {
  const result = clampToArea(bounds, area);
  let flipped = wasFlipped;
  if (enabled) {
    const left = Math.abs(bounds.x - area.x);
    const right = Math.abs(bounds.x + bounds.width - area.x - area.width);
    if (left <= 24 && left <= right) { result.x = area.x; flipped = true; }
    else if (right <= 24) { result.x = Math.max(area.x, area.x + area.width - bounds.width); flipped = false; }
    if (Math.abs(bounds.y - area.y) <= 24) result.y = area.y;
    else if (Math.abs(bounds.y + bounds.height - area.y - area.height) <= 24) result.y = Math.max(area.y, area.y + area.height - bounds.height);
  }
  return { bounds: result, flipped };
}
