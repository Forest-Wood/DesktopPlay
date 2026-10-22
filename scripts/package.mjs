import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readReleasePlan } from './release-policy.mjs';

const plan = await readReleasePlan(process.cwd());
const args = [createRequire(import.meta.url).resolve('electron-builder/cli.js'), '--win', 'nsis', 'portable', '--x64', '--publish', 'never', ...process.argv.slice(2)];
if (plan) args.push(`--config.releaseInfo.releaseNotesFile=${plan.notesFile}`);
const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
