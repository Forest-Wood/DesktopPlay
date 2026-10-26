import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nextVersion, announcement, prepareRelease, readReleasePlan } from '../../scripts/release-policy.mjs';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'desktoppet-policy-')); directories.push(root);
  await mkdir(path.join(root, 'src/shared'), { recursive: true });
  await Promise.all([
    writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.5.4', name: 'fixture' })),
    writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ version: '0.5.4', packages: { '': { version: '0.5.4' } } })),
    writeFile(path.join(root, 'src/shared/defaults.ts'), "export const APP_VERSION = '0.5.4';\n"),
    writeFile(path.join(root, 'notes.md'), '- 修复已有功能。\n- 完善更新公告。\n- 保留原有设置。\n'),
  ]);
  return root;
}
it.each<[string[], string]>([[['patch'], '0.5.5'], [['minor'], '0.6.0'], [['major'], '1.0.0'], [['patch', 'minor', 'patch'], '0.6.0'], [['minor', 'major'], '1.0.0']])('computes the highest change %j once', (types, version) => {
  expect(nextVersion('0.5.4', types)).toBe(version);
});
it('increments beyond 1.0 and rejects unclassified or non-stable releases', () => {
  expect(nextVersion('1.6.9', ['major'])).toBe('2.0.0');
  expect(nextVersion('1.6.9', ['minor'])).toBe('1.7.0');
  for (const base of ['v0.5.4', '0.5.4-beta.1', '01.2.3', '1.2']) expect(() => nextVersion(base, ['patch'])).toThrow();
  for (const changes of [[], ['internal'], ['patch', 'unknown']]) expect(() => nextVersion('0.5.4', changes)).toThrow();
});
it('keeps ordinary legacy development unversioned but requires a plan for publication', async () => {
  const root = await fixture(); expect(await readReleasePlan(root)).toBeNull();
  await expect(readReleasePlan(root, { required: true })).rejects.toThrow('release-plan');
});
it('prepares all version fields, canonical announcement and plan idempotently', async () => {
  const root = await fixture(), options = { baseVersion: '0.5.4', changeTypes: ['minor', 'patch', 'minor'], notesFile: 'notes.md' };
  const first = await prepareRelease(root, options);
  expect(first).toMatchObject({ version: '0.6.0', changeTypes: ['patch', 'minor'], notes: '- 修复已有功能。\n- 完善更新公告。\n- 保留原有设置。' });
  const before = await readFile(path.join(root, 'package-lock.json'), 'utf8');
  expect(await prepareRelease(root, { ...options, notesFile: undefined })).toEqual(first);
  expect(await readFile(path.join(root, 'package-lock.json'), 'utf8')).toBe(before);
  expect(await readReleasePlan(root, { required: true, latestVersion: 'v0.5.4', tag: 'v0.6.0' })).toEqual(first);
  await expect(readReleasePlan(root, { latestVersion: '0.5.5' })).rejects.toThrow('stale');
  await expect(readReleasePlan(root, { tag: 'v0.6.1' })).rejects.toThrow('tag/version');
});
it.each(['missing', 'blank', 'invalid-type', 'mismatch'])('refuses %s before changing any version', async kind => {
  const root = await fixture();
  if (kind === 'blank') await writeFile(path.join(root, 'notes.md'), ' \r\n');
  if (kind === 'mismatch') await writeFile(path.join(root, 'src/shared/defaults.ts'), "export const APP_VERSION = '0.5.3';");
  const before = await readFile(path.join(root, 'package.json'), 'utf8');
  await expect(prepareRelease(root, { baseVersion: '0.5.4', changeTypes: [kind === 'invalid-type' ? 'internal' : 'patch'], notesFile: kind === 'missing' ? 'absent.md' : 'notes.md' })).rejects.toThrow();
  expect(await readFile(path.join(root, 'package.json'), 'utf8')).toBe(before);
  await expect(readFile(path.join(root, 'release-plan.json'))).rejects.toThrow();
});
it('rejects deleted plans, changed calculations and missing/blank announcements', async () => {
  const root = await fixture(); await prepareRelease(root, { baseVersion: '0.5.4', changeTypes: ['patch'], notesFile: 'notes.md' });
  const notes = path.join(root, 'docs/releases/v0.5.5.md');
  await writeFile(notes, ''); await expect(readReleasePlan(root)).rejects.toThrow('announcement');
  await rm(notes); await expect(readReleasePlan(root)).rejects.toThrow();
  await writeFile(notes, '- 摘要');
  await writeFile(path.join(root, 'release-plan.json'), JSON.stringify({ baseVersion: '0.5.4', changeTypes: ['major'] }));
  await expect(readReleasePlan(root)).rejects.toThrow('declared');
  await rm(path.join(root, 'release-plan.json')); await expect(readReleasePlan(root)).rejects.toThrow('release-plan');
});
it('normalizes the shared announcement without rendering HTML', () => {
  expect(announcement('\uFEFF  - 更新\r\n- 修复\r\n')).toBe('- 更新\n- 修复');
  expect(announcement('<script>plain</script>')).toBe('<script>plain</script>');
  for (const notes of [undefined, '', '  ', 'x'.repeat(20001)]) expect(() => announcement(notes)).toThrow();
});
it('exposes the same preparation and validation through the CLI, without writing on bad input', async () => {
  const root = await fixture(), script = fileURLToPath(new URL('../../scripts/release-policy.mjs', import.meta.url));
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
  expect(run('prepare', '--base', '0.5.4', '--types', 'patch', '--notes', 'notes.md').status).toBe(0);
  expect(run('check', '--require-plan', '--tag', 'v0.5.5', '--latest-version', 'v0.5.4').status).toBe(0);
  expect(run('check', '--latest-version', '0.6.0').status).toBe(1);
  const before = await readFile(path.join(root, 'package.json'), 'utf8');
  expect(run('prepare', '--base', '0.5.5', '--types', 'wrong', '--notes', 'notes.md').status).toBe(1);
  expect(await readFile(path.join(root, 'package.json'), 'utf8')).toBe(before);
});
it('protects historical versions and existing tags from preparation', async () => {
  const root = await fixture();
  await expect(prepareRelease(root, { baseVersion: '0.5.3', changeTypes: ['patch'], notesFile: 'notes.md' })).rejects.toThrow('Historical');
  execFileSync('git', ['init', '--quiet', root], { windowsHide: true });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'fixture'], { cwd: root, windowsHide: true });
  execFileSync('git', ['tag', 'v0.5.5'], { cwd: root, windowsHide: true });
  await expect(prepareRelease(root, { baseVersion: '0.5.4', changeTypes: ['patch'], notesFile: 'notes.md' })).rejects.toThrow('already exists');
});

// Scope (one pet or all pets) must never imply a major bump.
it('uses minor for new features and patch for optimizations from the current baseline', () => {
  expect(nextVersion('1.0.1', ['minor'])).toBe('1.1.0');
  expect(nextVersion('1.0.1', ['minor', 'patch'])).toBe('1.1.0');
  expect(nextVersion('1.0.1', ['patch'])).toBe('1.0.2');
  expect(nextVersion('1.0.1', ['major'])).toBe('2.0.0'); // Explicit owner decision only.
});
