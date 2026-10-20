import { createHash } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';

/** Detect equal-length rewrites beyond the header without retaining log contents. */
export async function completionFileAnchor(handle: FileHandle, offset: number): Promise<string> {
  const start = Math.max(0, offset - 256), buffer = Buffer.alloc(offset - start);
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
  return createHash('sha256').update(buffer.subarray(0, bytesRead)).digest('hex');
}
