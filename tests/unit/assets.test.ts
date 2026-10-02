import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { inspectImage } from '../../src/main/pet-assets';
describe('pet image validation', () => {
  it('reads the authorized bundled PNG', async () => {
    expect(inspectImage(await readFile('public/assets/whale.png'))).toEqual({ mime: 'image/png', width: 610, height: 610 });
  });
  it('rejects non-images and oversized dimensions', () => {
    expect(() => inspectImage(Buffer.from('<script>alert(1)</script>'))).toThrow();
    const gif = Buffer.alloc(24); gif.write('GIF89a'); gif.writeUInt16LE(65535, 6); gif.writeUInt16LE(65535, 8);
    expect(() => inspectImage(gif)).toThrow();
  });
  it('accepts GIF dimensions', () => {
    const gif = Buffer.alloc(24); gif.write('GIF89a'); gif.writeUInt16LE(320, 6); gif.writeUInt16LE(240, 8);
    expect(inspectImage(gif)).toEqual({ mime: 'image/gif', width: 320, height: 240 });
  });
});
