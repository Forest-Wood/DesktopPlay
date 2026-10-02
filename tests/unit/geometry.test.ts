import { describe, expect, it } from 'vitest';
import { clampToArea, fitScale, petSize, snapToArea } from '../../src/main/geometry';
describe('desktop geometry in DIP', () => {
  const area = { x: -1920, y: 0, width: 1920, height: 1040 };
  it('supports scaled sizes and negative monitor coordinates', () => {
    expect(petSize(1.5)).toEqual({ width: 540, height: 660 });
    expect(clampToArea({ x: -2000, y: 900, width: 360, height: 440 }, area)).toEqual({ x: -1920, y: 600, width: 360, height: 440 });
  });
  it('snaps left and flips, then snaps right and unflips', () => {
    expect(snapToArea({ x: -1910, y: 20, width: 360, height: 440 }, area, true, false)).toEqual({ bounds: { x: -1920, y: 0, width: 360, height: 440 }, flipped: true });
    expect(snapToArea({ x: -370, y: 590, width: 360, height: 440 }, area, true, true)).toEqual({ bounds: { x: -360, y: 600, width: 360, height: 440 }, flipped: false });
  });
  it('keeps free positions without snapping and handles a removed display', () => {
    expect(snapToArea({ x: -1910, y: 20, width: 360, height: 440 }, area, false, false).bounds.x).toBe(-1910);
    expect(clampToArea({ x: -1920, y: 0, width: 360, height: 440 }, { x: 0, y: 0, width: 1280, height: 720 }).x).toBe(0);
  });
  it('fits enlarged pets into smaller work areas without clipping the character', () => {
    const small = { x: 0, y: 0, width: 1366, height: 728 };
    const size = petSize(fitScale(2, small));
    expect(size.height).toBeLessThanOrEqual(small.height);
    expect(size.width).toBeLessThanOrEqual(small.width);
    expect(fitScale(1, small)).toBe(1);
  });
});
