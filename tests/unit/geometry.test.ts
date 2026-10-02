import { describe, expect, it } from 'vitest';
import { characterOrigin, clampToArea, fitScale, petSize, placeCharacter, snapToArea } from '../../src/main/geometry';
import { contains, getPetLayout } from '../../src/shared/pet-layout';
import { GPT_DRAGON_PET } from '../../src/shared/defaults';
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

describe('character anchored layout', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const normal = { flipped: false, verticalFlipped: false, bubblePlacement: 'above' as const };
  it('faces the screen center without moving the character when the horizontal layout changes', () => {
    const anchor = { x: 400, y: 400 };
    const result = placeCharacter(anchor, area, 1, normal, false);
    expect(result.flipped).toBe(true);
    expect(characterOrigin(result.bounds, result)).toEqual(anchor);
    const center = placeCharacter({ x: 850, y: 400 }, area, 1, result, false);
    expect(center.flipped).toBe(true);
    expect(placeCharacter({ x: 875, y: 400 }, area, 1, center, false).flipped).toBe(false);
  });
  it('uses the visible character for top detection, with separate inversion and bubble hysteresis', () => {
    const near = placeCharacter({ x: 1200, y: 25 }, area, 1, normal, false);
    expect(near).toMatchObject({ verticalFlipped: false, bubblePlacement: 'below' });
    const top = placeCharacter({ x: 1200, y: 24 }, area, 1, near, false);
    expect(top).toMatchObject({ verticalFlipped: true, bubblePlacement: 'below' });
    expect(characterOrigin(top.bounds, top)).toEqual({ x: 1200, y: 24 });
    expect(placeCharacter({ x: 1200, y: 48 }, area, 1, top, false).verticalFlipped).toBe(true);
    const upright = placeCharacter({ x: 1200, y: 49 }, area, 1, top, false);
    expect(upright).toMatchObject({ verticalFlipped: false, bubblePlacement: 'below' });
    expect(characterOrigin(upright.bounds, upright).y).toBe(49);
    expect(placeCharacter({ x: 1200, y: 235 }, area, 1, upright, false).bubblePlacement).toBe('below');
    const above = placeCharacter({ x: 1200, y: 236 }, area, 1, upright, false);
    expect(above.bubblePlacement).toBe('above');
    expect(characterOrigin(above.bounds, above).y).toBe(236);
  });
  it.each([0.5, 1, 1.25, 1.5, 2])('keeps all layout boxes on screen at scale %s, including negative monitor coordinates', scale => {
    const display = { x: -1366, y: -150, width: 1366, height: 728 };
    for (const anchor of [{ x: -1366, y: -150 }, { x: 0, y: -150 }, { x: -1366, y: 578 }, { x: 0, y: 578 }]) {
      const result = placeCharacter(anchor, display, scale, normal, true);
      expect(result.bounds.x).toBeGreaterThanOrEqual(display.x);
      expect(result.bounds.y).toBeGreaterThanOrEqual(display.y);
      expect(result.bounds.x + result.bounds.width).toBeLessThanOrEqual(display.x + display.width);
      expect(result.bounds.y + result.bounds.height).toBeLessThanOrEqual(display.y + display.height);
      const layout = getPetLayout(result.flipped, result.bubblePlacement);
      expect(layout.bubbleHit.x).toBeGreaterThanOrEqual(0);
      expect(layout.bubbleHit.y).toBeGreaterThanOrEqual(0);
      expect(layout.bubbleHit.x + layout.bubbleHit.width).toBeLessThanOrEqual(360);
      expect(layout.bubbleHit.y + layout.bubbleHit.height).toBeLessThanOrEqual(440);
    }
  });
  it('restores a character from a removed display and keeps the bubble clickable while blank space passes through', () => {
    const result = placeCharacter({ x: -1800, y: -400 }, area, 1, normal, false);
    expect(result.bounds.x).toBe(0);
    expect(result.bounds.y).toBe(0);
    for (const flipped of [false, true]) for (const placement of ['above', 'below'] as const) {
      const layout = getPetLayout(flipped, placement);
      expect(contains(layout.bubbleHit, layout.bubble.x + 120, layout.bubble.y + 170)).toBe(true);
      expect(contains(layout.character, layout.character.x + 110, layout.character.y + 110)).toBe(true);
      const blankX = flipped ? 350 : 0;
      expect(contains(layout.character, blankX, 439) || contains(layout.bubbleHit, blankX, 439)).toBe(false);
    }
  });
  it.each([{ x: 0, y: 0, width: 1920, height: 1040 }, { x: -768, y: 0, width: 768, height: 1024 }])('has continuous reachable anchors at maximum requested size on $width×$height screens', display => {
    const scale = petSize(fitScale(2, display)).width / 360;
    let previous = placeCharacter({ x: display.x + 20, y: 0 }, display, 2, normal, false);
    for (let y = 0; y < display.height - 220 * scale; y++) {
      const next = placeCharacter({ x: display.x + 20, y }, display, 2, previous, false);
      expect(Math.abs(characterOrigin(next.bounds, next).y - y)).toBeLessThanOrEqual(1);
      previous = next;
    }
    for (let x = display.x; x < display.x + display.width - 220 * scale; x++) {
      const next = placeCharacter({ x, y: 300 }, display, 2, previous, false);
      expect(Math.abs(characterOrigin(next.bounds, next).x - x)).toBeLessThanOrEqual(1);
      previous = next;
    }
  });
  it.each([0.5, 1, 1.25, 1.5, 2])('aligns dragon visible bounds at all four monitor edges at scale %s', requested => {
    for (const display of [area, { x: -1366, y: -120, width: 1366, height: 728 }]) {
      const size = petSize(fitScale(requested, display, GPT_DRAGON_PET)), scale = size.width / 360;
      const { character, image } = getPetLayout(false, 'above', GPT_DRAGON_PET);
      const content = GPT_DRAGON_PET.contentBounds!;
      expect(image.y + content.y * image.height / content.imageHeight).toBeCloseTo(0);
      expect(image.y + (content.y + content.height) * image.height / content.imageHeight).toBeCloseTo(character.height);
      for (const left of [true, false]) for (const top of [true, false]) {
        const anchor = { x: left ? display.x : display.x + display.width - character.width * scale, y: top ? display.y : display.y + display.height - character.height * scale };
        const placed = placeCharacter(anchor, display, requested, normal, true, GPT_DRAGON_PET);
        const actual = characterOrigin(placed.bounds, placed, GPT_DRAGON_PET);
        expect(Math.abs(actual.x - anchor.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(actual.y - anchor.y)).toBeLessThanOrEqual(1);
        expect(placed.verticalFlipped).toBe(top);
      }
    }
  });
});
