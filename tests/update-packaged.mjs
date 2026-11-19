// Builds and upgrades two isolated Windows apps using the production updater code.
import { build as bundle } from 'esbuild';
import { build as pack } from 'electron-builder';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile, symlink, stat, rename, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePortableBlockMap } from '../src/shared/portable-blockmap.mjs';
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
  await writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'desktopplay-update-fixture', version, main: 'main.cjs', description: 'Isolated T008 test', author: 'DesktopPet tests' }));
  await bundle({ entryPoints: [path.join(repo, 'tests/fixtures/update-app.ts')], outfile: path.join(project, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'], define: { FIXTURE_ROOT: JSON.stringify(root) } });
  await copyFile(path.join(repo, 'build/update-helper.ps1'), path.join(project, 'update-helper.ps1'));
  const output = path.join(root, version);
  await pack({ projectDir: project, config: { appId: 'io.github.forestwood.desktopplay.update-fixture', productName: 'DesktopPet Update Fixture', electronVersion: '44.5.1', electronDist: path.join(repo, 'node_modules/electron/dist'), directories: { output }, files: ['main.cjs', 'update-helper.ps1', 'package.json'], npmRebuild: false, win: { target: ['nsis', 'portable'], signExecutable: false, icon: path.join(repo, 'build/icon.ico') }, nsis: { include: path.join(repo, 'build/installer.nsh'), oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: false, createStartMenuShortcut: false, deleteAppDataOnUninstall: false, runAfterFinish: false, artifactName: 'DesktopPet-${version}-Setup-x64.exe' }, portable: { artifactName: 'DesktopPet-${version}-Portable-x64.exe' }, publish: [{ provider: 'generic', url: 'https://fixture.invalid/' }] }, publish: 'never' });
  products[version] = output;
}
const low = products['0.0.1'], high = products['0.0.2'];
const setupName = 'DesktopPet-0.0.2-Setup-x64.exe', setupBlockmap = `${setupName}.blockmap`, oldSetupBlockmap = 'DesktopPet-0.0.1-Setup-x64.exe.blockmap';
const portableName = 'DesktopPet-0.0.2-Portable-x64.exe', portableBlockmap = `${portableName}.blockmap`;
await writePortableBlockMap(path.join(high, portableName), path.join(high, portableBlockmap));
const portableHash = await digest(path.join(high, portableName), 'sha256');
await writeFile(path.join(high, 'SHA256SUMS.txt'), `${portableHash}  ${portableName}\n`);
const setupFullSize = (await stat(path.join(high, setupName))).size;
const portableFullSize = (await stat(path.join(high, portableName))).size;
const release = {
  tag_name: 'v0.0.2', draft: false, prerelease: false, body: 'isolated test',
  assets: await Promise.all([portableName, portableBlockmap, 'SHA256SUMS.txt'].map(async name => ({ name, size: (await stat(path.join(high, name))).size, state: 'uploaded', browser_download_url: `https://github.com/Forest-Wood/DesktopPlay/releases/download/v0.0.2/${name}` }))),
};
const fileMap = new Map([
  ['latest.yml', path.join(high, 'latest.yml')],
  [portableName, path.join(high, portableName)],
  [portableBlockmap, path.join(high, portableBlockmap)],
  ['SHA256SUMS.txt', path.join(high, 'SHA256SUMS.txt')],
  [setupName, path.join(high, setupName)],
  [setupBlockmap, path.join(high, setupBlockmap)],
  [oldSetupBlockmap, path.join(low, oldSetupBlockmap)],
]);
const requests = [];
let forceFallback = false;
let transfer = { bytes: {}, rangeRequests: {}, fullRequests: {} };
function resetTransfer() { transfer = { bytes: {}, rangeRequests: {}, fullRequests: {} }; }
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1)); requests.push(name);
  if (name === 'release.json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(release)); return; }
  if (forceFallback && name.endsWith('.blockmap')) { res.writeHead(404); res.end(); return; }
  const filePath = fileMap.get(name);
  if (!filePath) { res.writeHead(404); res.end(); return; }
  stat(filePath).then(info => {
    const rangeHeader = !forceFallback ? req.headers.range : undefined;
    const match = typeof rangeHeader === 'string' ? /^bytes=(\d+)-(\d*)$/.exec(rangeHeader) : null;
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return;
      }
      const length = end - start + 1;
      transfer.bytes[name] = (transfer.bytes[name] ?? 0) + length;
      transfer.rangeRequests[name] = (transfer.rangeRequests[name] ?? 0) + 1;
      res.writeHead(206, { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': length });
      createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
    transfer.bytes[name] = (transfer.bytes[name] ?? 0) + info.size;
    transfer.fullRequests[name] = (transfer.fullRequests[name] ?? 0) + 1;
    res.writeHead(200, { 'Accept-Ranges': 'bytes', 'Content-Length': info.size });
    createReadStream(filePath).pipe(res);
  }).catch(() => { res.writeHead(404); res.end(); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
await writeFile(path.join(root, 'server.json'), JSON.stringify({ url: `http://127.0.0.1:${server.address().port}` }));
const profile = kind => path.join(root, `${kind}-profile`);
const nsisUpdaterCache = path.join(process.env.LOCALAPPDATA || '', 'desktopplay-update-fixture-updater');
async function status(kind, predicate) { return waitFor(async () => { const value = JSON.parse(await readFile(path.join(profile(kind), 'status.json'), 'utf8')); return predicate(value) && value; }, `${kind} status`); }
async function command(kind, value) { const file = path.join(profile(kind), 'command'); await writeFile(`${file}.tmp`, value); await rename(`${file}.tmp`, file); }
async function snapshot(kind) { return Promise.all(['settings.json', 'fixture-key.enc', 'ledger.json', 'imported-asset.txt'].map(f => readFile(path.join(profile(kind), f), 'utf8'))); }
async function stopped(pid) { if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid fixture PID'); await waitFor(async () => !execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object -ExpandProperty ProcessId`], { encoding: 'utf8', windowsHide: true }).trim(), 'fixture quit'); }
function startup(kind) { return execFileSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', `DesktopPet-T008-${kind}`], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); }
const installedDir = path.join(root, 'installed'), installedExe = path.join(installedDir, 'DesktopPet Update Fixture.exe');
const portableExe = path.join(root, 'Keep This Name.exe');
const metrics = {};
try {
  if (process.env.LOCALAPPDATA) await rm(nsisUpdaterCache, { recursive: true, force: true }).catch(() => {});
  await run(path.join(products['0.0.1'], 'DesktopPet-0.0.1-Setup-x64.exe'), ['/S', `/D=${installedDir}`]);
  await copyFile(path.join(products['0.0.1'], 'DesktopPet-0.0.1-Portable-x64.exe'), portableExe);
  for (const [kind, executable, targetName, fullSize] of [['installed', installedExe, setupName, setupFullSize], ['portable', portableExe, portableName, portableFullSize]]) {
    forceFallback = false;
    resetTransfer();
    start(executable); let before = await status(kind, s => s.version === '0.0.1'); const data = await snapshot(kind);
    await command(kind, 'startup'); await waitFor(async () => startup(kind).includes(executable), 'fixture startup registration');
    await command(kind, 'check'); await status(kind, s => s.state.status === 'available');
    await command(kind, 'download'); const readyDiff = await status(kind, s => s.state.status === 'ready');
    const diffBytes = transfer.bytes[targetName] ?? 0;
    const diffRanges = transfer.rangeRequests[targetName] ?? 0;
    const reductionPct = Number(((1 - diffBytes / fullSize) * 100).toFixed(2));
    if (diffRanges < 1 || diffBytes <= 0 || diffBytes >= fullSize * 0.3) {
      throw new Error(`${kind} expected differential download < 30% of ${fullSize}, got ${diffBytes} bytes across ${diffRanges} range requests`);
    }
    if (readyDiff.state.total <= 0 || readyDiff.state.total >= fullSize * 0.3) {
      throw new Error(`${kind} UI total (${readyDiff.state.total}) did not reflect incremental download size`);
    }
    metrics[kind] = { fullSize, diffBytes, diffRanges, reductionPct, reportedTotal: readyDiff.state.total };
    await command(kind, 'quit'); await stopped(before.pid);

    // An ordinary exit must leave the old executable installed, and second download must reuse verified cache.
    resetTransfer();
    start(executable); before = await status(kind, s => s.version === '0.0.1' && s.pid !== before.pid);
    await command(kind, 'check'); await status(kind, s => s.state.status === 'available');
    await command(kind, 'download'); await status(kind, s => s.state.status === 'ready');
    if ((transfer.bytes[targetName] ?? 0) !== 0) throw new Error(`${kind} did not reuse cached update`);
    await command(kind, 'quit'); await stopped(before.pid);

    // Verify differential failure falls back seamlessly to full download, then installs cleanly to 0.0.2.
    if (kind === 'installed') await rm(path.join(nsisUpdaterCache, 'pending'), { recursive: true, force: true });
    else await rm(path.join(profile(kind), 'downloads'), { recursive: true, force: true });
    forceFallback = true;
    resetTransfer();
    start(executable); before = await status(kind, s => s.version === '0.0.1' && s.pid !== before.pid);
    await command(kind, 'check'); await status(kind, s => s.state.status === 'available');
    await command(kind, 'download'); const readyFull = await status(kind, s => s.state.status === 'ready');
    if ((transfer.fullRequests[targetName] ?? 0) !== 1 || (transfer.bytes[targetName] ?? 0) !== fullSize) {
      throw new Error(`${kind} fallback did not download full package (${transfer.bytes[targetName]} vs ${fullSize})`);
    }
    if (readyFull.state.total !== fullSize) throw new Error(`${kind} fallback UI total (${readyFull.state.total}) did not match full size (${fullSize})`);
    metrics[kind].fallbackFullBytes = transfer.bytes[targetName];
    await command(kind, 'install'); const after = await status(kind, s => s.version === '0.0.2');
    if (JSON.stringify(data) !== JSON.stringify(await snapshot(kind))) throw new Error(`${kind} data changed`);
    if (!startup(kind).includes(executable) || (kind === 'portable' ? after.portablePath !== portableExe : after.executable !== installedExe)) throw new Error(`${kind} path or startup changed`);
    if (kind === 'portable') await waitFor(async () => { const pending = JSON.parse(await readFile(path.join(profile(kind), 'updates/pending.json'), 'utf8')); const result = JSON.parse((await readFile(path.join(pending.attempt, 'result.json'), 'utf8')).replace(/^\uFEFF/, '')); return result.status === 'success'; }, 'portable health receipt');
    await command(kind, 'cleanup'); await stopped(after.pid);
    console.log(`PASS ${kind}: 0.0.1 -> 0.0.2; diff ${diffBytes}/${fullSize} B (-${reductionPct}%, ${diffRanges} ranges), cache hit, fallback full download, data/path/startup, healthy restart`);
  }
  // New portable exits before acknowledging; the helper must restore and restart the old EXE.
  forceFallback = false;
  await copyFile(path.join(products['0.0.1'], 'DesktopPet-0.0.1-Portable-x64.exe'), portableExe);
  start(portableExe); const old = await status('portable', s => s.version === '0.0.1');
  await command('portable', 'check'); await status('portable', s => s.state.status === 'available');
  await command('portable', 'download'); await status('portable', s => s.state.status === 'ready');
  await writeFile(path.join(root, 'fail-next-start'), 'test'); await command('portable', 'install');
  const recovered = await status('portable', s => s.version === '0.0.1' && s.pid !== old.pid);
  if (await digest(portableExe, 'sha256') !== await digest(path.join(products['0.0.1'], 'DesktopPet-0.0.1-Portable-x64.exe'), 'sha256')) throw new Error('Rollback did not restore old file');
  await command('portable', 'cleanup'); await stopped(recovered.pid); console.log('PASS portable failed startup: backup restored and old app restarted');
  await writeFile(path.join(root, 'results.json'), JSON.stringify({ passed: ['installed', 'portable', 'portable-rollback'], metrics, requests }, null, 2));
} finally {
  // Only ask fixture instances to exit; never kill Electron processes by name.
  for (const kind of ['installed', 'portable']) await command(kind, 'cleanup').catch(() => {});
  await run(path.join(installedDir, 'Uninstall DesktopPet Update Fixture.exe'), ['/S']).catch(error => console.error('Fixture uninstall:', error.message));
  if (process.env.LOCALAPPDATA) await rm(nsisUpdaterCache, { recursive: true, force: true }).catch(() => {});
  server.close(); console.log(`Fixture artifacts: ${root}`);
}
