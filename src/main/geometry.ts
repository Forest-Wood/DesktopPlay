export interface Rect { x: number; y: number; width: number; height: number }
export const PET_WIDTH = 360;
export const PET_HEIGHT = 440;
export function fitScale(requested: number, area: Rect): number {
  return Math.min(requested, area.width / PET_WIDTH, area.height / PET_HEIGHT);
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
