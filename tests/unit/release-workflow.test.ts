import { afterEach, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

type Workflow = { jobs: { 'build-and-release': { steps: { name: string; run?: string }[] } } };
const workflow = createRequire(import.meta.url)('js-yaml').load(readFileSync('.github/workflows/release.yml', 'utf8')) as Workflow;
const steps = workflow.jobs['build-and-release'].steps;
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) { if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(directory).startsWith('desktoppet-release-gate-')) throw new Error('Unexpected cleanup target'); await rm(directory, { recursive: true, force: true }); } });
async function fixture(mode = 'valid', stepName = 'Publish only after every asset is verified') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'desktoppet-release-gate-')); directories.push(directory); await mkdir(path.join(directory, 'release'));
  const names = ['DesktopPet-0.5.3-Setup-x64.exe', 'DesktopPet-0.5.3-Portable-x64.exe', 'SHA256SUMS.txt', 'latest.yml', 'DesktopPet-0.5.3-Setup-x64.exe.blockmap'];
  const assets = await Promise.all(names.map(async name => { const data = Buffer.from(`fixture ${name}`); await writeFile(path.join(directory, 'release', name), data); return { name, size: data.length, state: 'uploaded', digest: `sha256:${createHash('sha256').update(data).digest('hex')}` }; }));
  if (mode === 'missing') assets.pop();
  if (mode === 'digest') assets[0].digest = 'sha256:' + '0'.repeat(64);
  if (mode === 'size') assets[0].size++;
  const release = { id: 123, tag_name: 'v0.5.3', draft: mode !== 'published', assets };
  const old = { id: 1, tag_name: 'v0.5.2', draft: false, assets: [] };
  const pages = mode === 'single' ? [[old, release]] : [[old], mode === 'duplicate' ? [release, { ...release, id: 124 }] : [release]];
  await writeFile(path.join(directory, 'pages.json'), JSON.stringify(pages));
  const script = `$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:GITHUB_REPOSITORY='Forest-Wood/DesktopPlay'
$env:RELEASE_TAG='v0.5.3'
function gh {
  $global:LASTEXITCODE=0
  if ($args -contains 'PATCH') { [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'published'), ($args -join '|')); return }
  if ($args -notcontains '--paginate' -or $args -notcontains '--slurp' -or ($args -join ' ') -match '/releases/tags/') { throw 'Draft lookup must use paginated release collection' }
  return [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'pages.json'))
}
${steps.find(s => s.name === stepName)!.run}
`;
  const scriptPath = path.join(directory, 'gate.ps1'); await writeFile(scriptPath, script);
  const env = { ...process.env };
  // A pwsh-hosted CI step may export PS7 modules that Windows PowerShell 5
  // cannot import. Let the isolated legacy test process use its own defaults.
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { cwd: directory, encoding: 'utf8', windowsHide: true, timeout: 15000, env });
  return { directory, result };
}
it.skipIf(process.platform !== 'win32').each(['valid', 'single'])('publishes only the exact verified draft with %s pagination', async mode => {
  const f = await fixture(mode); expect(f.result.status, f.result.stderr).toBe(0); expect(await readFile(path.join(f.directory, 'published'), 'utf8')).toContain('releases/123');
});
it.skipIf(process.platform !== 'win32').each(['missing', 'digest', 'size', 'duplicate', 'published'])('keeps %s resources unpublished', async mode => {
  const f = await fixture(mode); expect(f.result.status).not.toBe(0); await expect(readFile(path.join(f.directory, 'published'))).rejects.toThrow();
});
it.skipIf(process.platform !== 'win32')('refuses to overwrite an already published version', async () => {
  const f = await fixture('published', 'Refuse to overwrite a published release'); expect(f.result.status).not.toBe(0); await expect(readFile(path.join(f.directory, 'published'))).rejects.toThrow();
});
