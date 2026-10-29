import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanProject } from '../../scripts/clean.mjs';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'desktopplay-clean-')); roots.push(root);
  execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
  const put = async (name: string) => { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), 'safe'); };
  return { root, put };
}
describe('project cleanup boundaries', () => {
  it('previews, deletes only generated targets, and is repeatable', async () => {
    const { root, put } = await fixture();
    for (const name of ['dist/output.js', 'test-results/result.png', '.tmp/smoke-test/data', 'release/installer.exe', '.tmp/manual-profile/data', '.tmp/other/data', 'src/app.ts', 'build/icon.ico', 'node_modules/lib/file']) await put(name);
    const preview = await cleanProject(root, { dryRun: true });
    expect(preview.bytes).toBe(12); expect(preview.skipped).toEqual([]);
    expect(await readFile(path.join(root, 'dist/output.js'), 'utf8')).toBe('safe');
    expect((await cleanProject(root)).bytes).toBe(12);
    expect((await cleanProject(root)).bytes).toBe(0);
    for (const name of ['release/installer.exe', '.tmp/manual-profile/data', '.tmp/other/data', 'src/app.ts', 'build/icon.ico', 'node_modules/lib/file']) expect(await readFile(path.join(root, name), 'utf8')).toBe('safe');
  });
  it('protects tracked files and their entire target', async () => {
    const { root, put } = await fixture(); await put('dist/tracked'); await put('dist/untracked');
    execFileSync('git', ['add', 'dist/tracked'], { cwd: root, windowsHide: true });
    const result = await cleanProject(root);
    expect(result.skipped[0]?.reason).toContain('Git-tracked');
    expect(await readFile(path.join(root, 'dist/untracked'), 'utf8')).toBe('safe');
  });
  it('refuses nested directory links without touching their target or siblings', async () => {
    const { root, put } = await fixture(); const outside = await fixture(); await outside.put('keep');
    await put('dist/sibling');
    await symlink(outside.root, path.join(root, 'dist/link'), 'junction');
    const result = await cleanProject(root);
    expect(result.skipped[0]?.reason).toContain('links');
    expect(await readFile(path.join(outside.root, 'keep'), 'utf8')).toBe('safe');
    expect(await readFile(path.join(root, 'dist/sibling'), 'utf8')).toBe('safe');
  });
  it('does not enumerate a linked temporary directory', async () => {
    const { root } = await fixture(); const outside = await fixture(); await outside.put('smoke-external/keep');
    await symlink(outside.root, path.join(root, '.tmp'), 'junction');
    expect((await cleanProject(root)).skipped[0]?.path).toBe('.tmp');
    expect(await readFile(path.join(outside.root, 'smoke-external/keep'), 'utf8')).toBe('safe');
  });
  it('rejects a subdirectory rather than treating it as a project root', async () => {
    const { root, put } = await fixture(); await put('nested/dist/keep');
    await expect(cleanProject(path.join(root, 'nested'))).rejects.toThrow('repository root');
    expect(await readFile(path.join(root, 'nested/dist/keep'), 'utf8')).toBe('safe');
  });
});
