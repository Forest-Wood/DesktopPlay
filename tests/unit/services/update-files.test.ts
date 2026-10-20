import { afterEach, expect, it, vi } from 'vitest';
import { link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const aliases = vi.hoisted(() => new Map<string, string>());
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, realpath: async (file: Parameters<typeof actual.realpath>[0]) => aliases.get(String(file)) ?? actual.realpath(file) };
});
import { plainPath } from '../../../src/main/services/update-files';
const directories: string[] = [];
afterEach(async () => { aliases.clear(); await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'desktoppet-path-')); directories.push(root);
  const requested = path.join(root, 'SHORT~1.exe'), canonical = path.join(root, 'expanded-file-name.exe');
  await writeFile(canonical, 'same fixture bytes'); return { root, requested, canonical };
}
it('accepts an OS-expanded path only when both names identify the same physical file', async () => {
  const f = await fixture(); await link(f.canonical, f.requested); aliases.set(f.requested, f.canonical);
  await expect(plainPath(f.requested, true)).resolves.toBeUndefined();
});
it('rejects a different file even when bytes and path spelling look compatible', async () => {
  const f = await fixture(); await writeFile(f.requested, 'same fixture bytes'); aliases.set(f.requested, f.canonical);
  await expect(plainPath(f.requested, true)).rejects.toMatchObject({ code: 'UPDATE_PERMISSION' });
});
it('still rejects junction parents before accepting canonical aliases', async () => {
  const f = await fixture(), target = path.join(f.root, 'actual'), junction = path.join(f.root, 'linked');
  await mkdir(target); await writeFile(path.join(target, 'setup.exe'), 'fixture'); await symlink(target, junction, 'junction');
  const requested = path.join(junction, 'setup.exe'); aliases.set(requested, path.join(target, 'setup.exe'));
  await expect(plainPath(requested, true)).rejects.toMatchObject({ code: 'UPDATE_PERMISSION' });
});
