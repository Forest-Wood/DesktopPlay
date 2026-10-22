import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { announcement, readReleasePlan } from './release-policy.mjs';

export async function digest(filename, algorithm, encoding = 'hex') {
  const hash = createHash(algorithm); for await (const chunk of createReadStream(filename)) hash.update(chunk); return hash.digest(encoding);
}
export async function verifyRelease(directory, version, writeChecksums = true, expectedNotes) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Stable release version required');
  const setup = `DesktopPet-${version}-Setup-x64.exe`, portable = `DesktopPet-${version}-Portable-x64.exe`;
  const executables = [portable, setup].sort();
  const actual = (await readdir(directory)).filter(name => name.endsWith('-x64.exe')).sort();
  if (JSON.stringify(actual) !== JSON.stringify(executables)) throw new Error('Expected exactly the versioned Setup and Portable executables');
  const info = yaml.load(await readFile(path.join(directory, 'latest.yml'), 'utf8'));
  if (!info || info.version !== version || !Array.isArray(info.files) || info.files.length !== 1) throw new Error('Invalid latest.yml version or files');
  if (expectedNotes !== undefined && announcement(info.releaseNotes) !== announcement(expectedNotes)) throw new Error('latest.yml release announcement does not match the release notes');
  const file = info.files[0], setupPath = path.join(directory, setup), size = (await stat(setupPath)).size;
  const sha512 = await digest(setupPath, 'sha512', 'base64');
  if (file.url !== setup || file.sha512 !== sha512 || file.size !== size || (info.path && info.path !== setup) || (info.sha512 && info.sha512 !== sha512)) throw new Error('NSIS update metadata does not match installer');
  const blockmap = `${setup}.blockmap`;
  if ((await stat(path.join(directory, blockmap))).size < 1) throw new Error('NSIS blockmap missing');
  const lines = [];
  for (const name of executables) {
    if ((await stat(path.join(directory, name))).size < 1) throw new Error('Empty executable');
    lines.push(`${await digest(path.join(directory, name), 'sha256')}  ${name}`);
  }
  const sums = `${lines.join('\n')}\n`;
  if (writeChecksums) await writeFile(path.join(directory, 'SHA256SUMS.txt'), sums, 'ascii');
  else if ((await readFile(path.join(directory, 'SHA256SUMS.txt'), 'ascii')).replace(/\r\n/g, '\n') !== sums) throw new Error('SHA256SUMS does not match executables');
  return [...executables, 'SHA256SUMS.txt', 'latest.yml', blockmap];
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const tag = process.env.RELEASE_TAG;
  if (tag && tag !== `v${pkg.version}`) throw new Error('Tag/version mismatch');
  const plan = await readReleasePlan(process.cwd(), { required: !!tag, tag });
  const names = await verifyRelease(path.resolve(process.argv[2] || 'release'), pkg.version, true, plan?.notes);
  process.stdout.write(`Verified update assets: ${names.join(', ')}\n`);
}
