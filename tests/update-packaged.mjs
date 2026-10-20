// Builds and upgrades two isolated Windows apps using the production updater code.
import { build as bundle } from 'esbuild';
import { build as pack } from 'electron-builder';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile, symlink, stat, rename } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from '../scripts/verify-release.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(repo, '.tmp'), { recursive: true });
const reuse = process.argv[2];
const root = reuse ? path.resolve(reuse) : await mkdtemp(path.join(repo, '.tmp', 'T008-upgrade-'));
if (!root.startsWith(path.join(repo, '.tmp') + path.sep)) throw new Error('Invalid fixture root');
const project = path.join(root, 'app');
if (!reuse) { await mkdir(project); await symlink(path.join(repo, 'node_modules'), path.join(project, 'node_modules'), 'junction'); }
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.DESKTOPPLAY_UPDATE_TOKEN;
function run(file, args) { return new Promise((resolve, reject) => { const child = spawn(file, args, { env, windowsHide: true, stdio: 'inherit' }); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Fixture process exited ${code}`))); }); }
function start(file) { const child = spawn(file, [], { env, windowsHide: true, detached: true, stdio: 'ignore' }); child.on('error', error => { throw error; }); child.unref(); }
async function waitFor(fn, label, ms = 120000) { const until = Date.now() + ms; while (Date.now() < until) { const result = await fn().catch(() => null); if (result) return result; await new Promise(r => setTimeout(r, 200)); } throw new Error(`Timeout: ${label}; fixtures at ${root}`); }
const products = {};
for (const version of ['0.0.1', '0.0.2']) {
  products[version] = path.join(root, version);
  if (reuse) continue;
  await writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'desktopplay-update-fixture', version, main: 'main.cjs', description: 'Isolated T008 test', author: 'DesktopPet tests', dependencies: { 'electron-updater': '6.8.9', semver: '7.7.3' } }));
  await bundle({ entryPoints: [path.join(repo, 'tests/fixtures/update-app.ts')], outfile: path.join(project, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'electron-updater'], define: { FIXTURE_ROOT: JSON.stringify(root) } });
  await copyFile(path.join(repo, 'build/update-helper.ps1'), path.join(project, 'update-helper.ps1'));
  const output = path.join(root, version);
  await pack({ projectDir: project, config: { appId: 'io.github.forestwood.desktopplay.update-fixture', productName: 'DesktopPet Update Fixture', electronVersion: '44.5.1', electronDist: path.join(repo, 'node_modules/electron/dist'), directories: { output }, files: ['main.cjs', 'update-helper.ps1', 'package.json'], npmRebuild: false, win: { target: ['nsis', 'portable'], signExecutable: false, icon: path.join(repo, 'build/icon.ico') }, nsis: { include: path.join(repo, 'build/installer.nsh'), oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: false, createStartMenuShortcut: false, deleteAppDataOnUninstall: false, runAfterFinish: false, artifactName: 'DesktopPet-${version}-Setup-x64.exe' }, portable: { artifactName: 'DesktopPet-${version}-Portable-x64.exe' }, publish: [{ provider: 'generic', url: 'https://fixture.invalid/' }] }, publish: 'never' });
  products[version] = output;
}
const high = products['0.0.2'], portableName = 'DesktopPet-0.0.2-Portable-x64.exe';
const portableHash = await digest(path.join(high, portableName), 'sha256');
await writeFile(path.join(high, 'SHA256SUMS.txt'), `${portableHash}  ${portableName}\n`);
const release = { tag_name: 'v0.0.2', draft: false, prerelease: false, body: 'isolated test', assets: await Promise.all([portableName, 'SHA256SUMS.txt'].map(async name => ({ name, size: (await stat(path.join(high, name))).size, state: 'uploaded', browser_download_url: `https://github.com/Forest-Wood/DesktopPlay/releases/download/v0.0.2/${name}` }))) };
const requests = [];
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1)); requests.push(name);
  if (name === 'release.json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(release)); return; }
  if (!['latest.yml', portableName, 'SHA256SUMS.txt', 'DesktopPet-0.0.2-Setup-x64.exe', 'DesktopPet-0.0.2-Setup-x64.exe.blockmap'].includes(name)) { res.writeHead(404); res.end(); return; }
  stat(path.join(high, name)).then(info => { res.setHeader('Content-Length', info.size); createReadStream(path.join(high, name)).pipe(res); }).catch(() => { res.writeHead(404); res.end(); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
await writeFile(path.join(root, 'server.json'), JSON.stringify({ url: `http://127.0.0.1:${server.address().port}` }));
const profile = kind => path.join(root, `${kind}-profile`);
async function status(kind, predicate) { return waitFor(async () => { const value = JSON.parse(await readFile(path.join(profile(kind), 'status.json'), 'utf8')); return predicate(value) && value; }, `${kind} status`); }
async function command(kind, value) { const file = path.join(profile(kind), 'command'); await writeFile(`${file}.tmp`, value); await rename(`${file}.tmp`, file); }
async function snapshot(kind) { return Promise.all(['settings.json', 'fixture-key.enc', 'ledger.json', 'imported-asset.txt'].map(f => readFile(path.join(profile(kind), f), 'utf8'))); }
async function stopped(pid) { if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid fixture PID'); await waitFor(async () => !execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object -ExpandProperty ProcessId`], { encoding: 'utf8', windowsHide: true }).trim(), 'fixture quit'); }
function startup(kind) { return execFileSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', `DesktopPet-T008-${kind}`], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); }
const installedDir = path.join(root, 'installed'), installedExe = path.join(installedDir, 'DesktopPet Update Fixture.exe');
const portableExe = path.join(root, 'Keep This Name.exe');
try {
  await run(path.join(products['0.0.1'], 'DesktopPet-0.0.1-Setup-x64.exe'), ['/S', `/D=${installedDir}`]);
  await copyFile(path.join(products['0.0.1'], 'DesktopPet-0.0.1-Portable-x64.exe'), portableExe);
  for (const [kind, executable] of [['installed', installedExe], ['portable', portableExe]]) {
    start(executable); let before = await status(kind, s => s.version === '0.0.1'); const data = await snapshot(kind);
    await command(kind, 'startup'); await waitFor(async () => startup(kind).includes(executable), 'fixture startup registration');
    await command(kind, 'check'); await status(kind, s => s.state.status === 'available');
    await command(kind, 'download'); await status(kind, s => s.state.status === 'ready');
    await command(kind, 'quit'); await stopped(before.pid);
    // An ordinary exit must leave the old executable installed.
    start(executable); before = await status(kind, s => s.version === '0.0.1' && s.pid !== before.pid);
    await command(kind, 'check'); await status(kind, s => s.state.status === 'available');
    await command(kind, 'download'); await status(kind, s => s.state.status === 'ready');
    await command(kind, 'install'); const after = await status(kind, s => s.version === '0.0.2');
    if (JSON.stringify(data) !== JSON.stringify(await snapshot(kind))) throw new Error(`${kind} data changed`);
    if (!startup(kind).includes(executable) || (kind === 'portable' ? after.portablePath !== portableExe : after.executable !== installedExe)) throw new Error(`${kind} path or startup changed`);
    if (kind === 'portable') await waitFor(async () => { const pending = JSON.parse(await readFile(path.join(profile(kind), 'updates/pending.json'), 'utf8')); const result = JSON.parse((await readFile(path.join(pending.attempt, 'result.json'), 'utf8')).replace(/^\uFEFF/, '')); return result.status === 'success'; }, 'portable health receipt');
    await command(kind, 'cleanup'); await stopped(after.pid);
    console.log(`PASS ${kind}: 0.0.1 -> 0.0.2; ordinary exit, cache, data, path, startup, healthy restart`);
  }
  // New portable exits before acknowledging; the helper must restore and restart the old EXE.
  await copyFile(path.join(products['0.0.1'], 'DesktopPet-0.0.1-Portable-x64.exe'), portableExe);
  start(portableExe); const old = await status('portable', s => s.version === '0.0.1');
  await command('portable', 'check'); await status('portable', s => s.state.status === 'available');
  await command('portable', 'download'); await status('portable', s => s.state.status === 'ready');
  await writeFile(path.join(root, 'fail-next-start'), 'test'); await command('portable', 'install');
  const recovered = await status('portable', s => s.version === '0.0.1' && s.pid !== old.pid);
  if (await digest(portableExe, 'sha256') !== await digest(path.join(products['0.0.1'], 'DesktopPet-0.0.1-Portable-x64.exe'), 'sha256')) throw new Error('Rollback did not restore old file');
  await command('portable', 'cleanup'); await stopped(recovered.pid); console.log('PASS portable failed startup: backup restored and old app restarted');
  await writeFile(path.join(root, 'results.json'), JSON.stringify({ passed: ['installed', 'portable', 'portable-rollback'], requests }, null, 2));
} finally {
  // Only ask fixture instances to exit; never kill Electron processes by name.
  for (const kind of ['installed', 'portable']) await command(kind, 'cleanup').catch(() => {});
  await run(path.join(installedDir, 'Uninstall DesktopPet Update Fixture.exe'), ['/S']).catch(error => console.error('Fixture uninstall:', error.message));
  server.close(); console.log(`Fixture artifacts: ${root}`);
}
