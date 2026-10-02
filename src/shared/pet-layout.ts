import type { BubblePlacement, PetAsset } from './types';

export interface Rect { x: number; y: number; width: number; height: number }
export const PET_WIDTH = 360;
export const PET_HEIGHT = 440;
export const CHARACTER_SIZE = 220;
export const BUBBLE_RING = 6;
export const BUBBLE_TAIL = 20;

/** Renderer positions and native click-through regions share one source of truth. */
export function getPetLayout(flipped: boolean, placement: BubblePlacement, asset?: PetAsset) {
  const content = asset?.contentBounds;
  const ratio = content ? CHARACTER_SIZE / Math.max(content.width, content.height) : 1;
  const width = content ? content.width * ratio : CHARACTER_SIZE;
  const height = content ? content.height * ratio : CHARACTER_SIZE;
  const character: Rect = { x: flipped ? 0 : PET_WIDTH - width, y: placement === 'above' ? PET_HEIGHT - height : 0, width, height };
  const image: Rect = content ? { x: -content.x * ratio, y: -content.y * ratio, width: content.imageWidth * ratio, height: content.imageHeight * ratio } : { x: 0, y: 0, width, height };
  const bubble: Rect = { x: flipped ? 116 : 8, y: placement === 'above' ? 30 : 230, width: 236, height: 180 };
  const bubbleHit: Rect = { x: bubble.x - BUBBLE_RING, y: bubble.y - (placement === 'above' ? BUBBLE_RING : BUBBLE_TAIL), width: bubble.width + BUBBLE_RING * 2, height: bubble.height + BUBBLE_RING + BUBBLE_TAIL };
  return { character, image, bubble, bubbleHit };
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
