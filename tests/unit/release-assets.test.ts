import { afterEach, expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyRelease } from '../../scripts/verify-release.mjs';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'desktoppet-release-')); dirs.push(dir);
  const setup = 'DesktopPet-0.5.3-Setup-x64.exe', hash = createHash('sha512').update('setup').digest('base64');
  await Promise.all([[setup, 'setup'], [`${setup}.blockmap`, 'map'], ['DesktopPet-0.5.3-Portable-x64.exe', 'portable'], ['latest.yml', `version: 0.5.3\nfiles:\n  - url: ${setup}\n    size: 5\n    sha512: ${hash}\npath: ${setup}\nsha512: ${hash}\n`]].map(([name, data]) => writeFile(path.join(dir, name), data)));
  return { dir, setup };
}
it('verifies all five updater artifacts and recomputes checksums', async () => {
  const f = await fixture(); expect(await verifyRelease(f.dir, '0.5.3')).toHaveLength(5); await verifyRelease(f.dir, '0.5.3', false);
  await writeFile(path.join(f.dir, 'SHA256SUMS.txt'), 'bad'); await expect(verifyRelease(f.dir, '0.5.3', false)).rejects.toThrow('SHA256SUMS');
});
it.each(['file', 'version', 'size', 'sha512', 'blockmap', 'extra'])('refuses to publish invalid %s', async kind => {
  const f = await fixture(), meta = path.join(f.dir, 'latest.yml');
  if (kind === 'file') await writeFile(path.join(f.dir, f.setup), 'corrupt');
  if (kind === 'version') await writeFile(meta, (await readFile(meta, 'utf8')).replace('version: 0.5.3', 'version: 0.5.2'));
  if (kind === 'size') await writeFile(meta, (await readFile(meta, 'utf8')).replace('size: 5', 'size: 6'));
  if (kind === 'sha512') await writeFile(meta, (await readFile(meta, 'utf8')).replace(/sha512: .*/g, 'sha512: bad'));
  if (kind === 'blockmap') await rm(path.join(f.dir, `${f.setup}.blockmap`));
  if (kind === 'extra') await writeFile(path.join(f.dir, 'old-x64.exe'), 'old');
  await expect(verifyRelease(f.dir, '0.5.3')).rejects.toThrow();
});
