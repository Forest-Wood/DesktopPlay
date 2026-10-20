import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export const updateFailure = (code: string) => Object.assign(new Error(code), { code });
export const samePath = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
export async function plainPath(filename: string, file = false): Promise<void> {
  if (!path.isAbsolute(filename) || /[\x00-\x1f]/.test(filename) || filename.startsWith('\\\\')) throw updateFailure('UPDATE_PERMISSION');
  let current = path.resolve(filename);
  while (true) {
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || (current === path.resolve(filename) && file && !info.isFile())) throw updateFailure('UPDATE_PERMISSION');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || file && current === path.resolve(filename)) throw error; }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  if (file && !samePath(await realpath(filename), filename)) throw updateFailure('UPDATE_PERMISSION');
}
export async function fileDigest(filename: string, algorithm = 'sha256', encoding: 'hex' | 'base64' = 'hex'): Promise<string> {
  const hash = createHash(algorithm); for await (const chunk of createReadStream(filename)) hash.update(chunk); return hash.digest(encoding);
}
