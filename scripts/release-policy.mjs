import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import semver from 'semver';

export const LEGACY_VERSION = '0.5.4';
export function stable(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) || !semver.valid(value)) throw new Error('Expected a stable x.y.z version');
  return value;
}
export function nextVersion(baseVersion, changeTypes) {
  stable(baseVersion);
  if (!Array.isArray(changeTypes) || !changeTypes.length || changeTypes.some(type => !['patch', 'minor', 'major'].includes(type))) throw new Error('Declare patch, minor or major changes');
  const level = changeTypes.includes('major') ? 'major' : changeTypes.includes('minor') ? 'minor' : 'patch';
  return stable(semver.inc(baseVersion, level));
}
export function announcement(value) {
  if (typeof value !== 'string') throw new Error('Release announcement is missing');
  const result = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!result || result.length > 20000) throw new Error('Release announcement must contain 1–20000 characters');
  return result;
}
async function versions(root) {
  const [packageText, lockText, defaults] = await Promise.all(['package.json', 'package-lock.json', 'src/shared/defaults.ts'].map(file => readFile(path.join(root, file), 'utf8')));
  const pkg = JSON.parse(packageText), lock = JSON.parse(lockText);
  stable(pkg.version);
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version || defaults.match(/export const APP_VERSION = '([^']+)'/)?.[1] !== pkg.version) throw new Error('Package, lock and APP_VERSION must match');
  return { pkg, lock, defaults };
}
export async function readReleasePlan(root, { required = false, latestVersion, tag } = {}) {
  const { pkg } = await versions(root);
  if (tag !== undefined && tag !== `v${pkg.version}`) throw new Error('Release tag/version mismatch');
  let plan;
  try { plan = JSON.parse(await readFile(path.join(root, 'release-plan.json'), 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (required || pkg.version !== LEGACY_VERSION) throw new Error('Prepare a release-plan.json before changing the software version');
    return null;
  }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || Object.keys(plan).sort().join(',') !== 'baseVersion,changeTypes') throw new Error('Invalid release plan');
  const version = nextVersion(plan.baseVersion, plan.changeTypes);
  if (version !== pkg.version) throw new Error('Version does not match the declared release changes');
  if (latestVersion !== undefined && stable(latestVersion.replace(/^v/, '')) !== plan.baseVersion) throw new Error('Release base is stale; prepare from the latest published stable version');
  const notesFile = path.join(root, 'docs', 'releases', `v${version}.md`);
  return { ...plan, version, notesFile, notes: announcement(await readFile(notesFile, 'utf8')) };
}
export async function prepareRelease(root, { baseVersion, changeTypes, notesFile }) {
  const version = nextVersion(baseVersion, changeTypes);
  if (semver.lte(version, LEGACY_VERSION)) throw new Error('Historical releases must not be rewritten');
  const existingTag = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/tags/v${version}`], { cwd: root, windowsHide: true });
  if (existingTag.error) throw existingTag.error;
  if (existingTag.status === 0) throw new Error('This release tag already exists; use the next release base');
  if (![1, 128].includes(existingTag.status)) throw new Error('Could not verify existing release tags');
  const { pkg, lock, defaults } = await versions(root);
  if (![baseVersion, version].includes(pkg.version)) throw new Error('Current version is neither the release base nor its prepared version');
  const target = path.join(root, 'docs', 'releases', `v${version}.md`);
  const notes = announcement(await readFile(notesFile ? path.resolve(root, notesFile) : target, 'utf8'));
  // Validate everything before any write. Repeating a plan computes from its explicit base.
  const plan = { baseVersion, changeTypes: [...new Set(changeTypes)].sort((a, b) => ['patch', 'minor', 'major'].indexOf(a) - ['patch', 'minor', 'major'].indexOf(b)) };
  pkg.version = version; lock.version = version; lock.packages[''].version = version;
  const files = [
    ['package.json', JSON.stringify(pkg, null, 2) + '\n'],
    ['package-lock.json', JSON.stringify(lock, null, 2) + '\n'],
    ['src/shared/defaults.ts', defaults.replace(/export const APP_VERSION = '[^']+'/, `export const APP_VERSION = '${version}'`)],
    ['release-plan.json', JSON.stringify(plan, null, 2) + '\n'],
    [path.relative(root, target), notes + '\n'],
  ];
  for (const [file, contents] of files) {
    const filename = path.join(root, file); await mkdir(path.dirname(filename), { recursive: true });
    if (await readFile(filename, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; }) !== contents) await writeFile(filename, contents, 'utf8');
  }
  return readReleasePlan(root, { required: true });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { base: { type: 'string' }, types: { type: 'string' }, notes: { type: 'string' }, 'require-plan': { type: 'boolean' }, 'latest-version': { type: 'string' }, tag: { type: 'string' } } });
    const command = positionals[0];
    if (positionals.length !== 1 || !['prepare', 'check'].includes(command)) throw new Error('Use prepare --base x.y.z --types patch,minor,major --notes file, or check [--require-plan --latest-version x.y.z --tag vx.y.z]');
    const plan = command === 'prepare' ? await prepareRelease(process.cwd(), { baseVersion: values.base, changeTypes: values.types?.split(','), notesFile: values.notes })
      : await readReleasePlan(process.cwd(), { required: values['require-plan'], latestVersion: values['latest-version'], tag: values.tag });
    console.log(plan ? `Verified v${plan.version}: ${plan.changeTypes.join(', ')} from ${plan.baseVersion}; announcement ${path.relative(process.cwd(), plan.notesFile)}` : 'Version fields match the published legacy baseline; no release prepared.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
