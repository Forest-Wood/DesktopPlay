import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { writePortableBlockMap } from '../src/shared/portable-blockmap.mjs';
import { readReleasePlan } from './release-policy.mjs';

const plan = await readReleasePlan(process.cwd());
const args = [createRequire(import.meta.url).resolve('electron-builder/cli.js'), '--win', 'nsis', 'portable', '--x64', '--publish', 'never', ...process.argv.slice(2)];
if (plan) args.push(`--config.releaseInfo.releaseNotesFile=${plan.notesFile}`);
const code = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  child.on('error', reject);
  child.on('exit', exitCode => resolve(exitCode ?? 1));
});
if (code !== 0) {
  process.exitCode = code;
} else {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const portable = path.resolve('release', `DesktopPet-${pkg.version}-Portable-x64.exe`);
  try {
    await stat(portable);
    const result = await writePortableBlockMap(portable);
    process.stdout.write(`Built portable blockmap: ${path.basename(result.outFile)} (${result.bytes} bytes)\n`);
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }
}
