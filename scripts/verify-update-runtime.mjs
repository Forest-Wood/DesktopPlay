import { extractFile } from '@electron/asar';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';

const resources = path.resolve(process.argv[2] || 'release/win-unpacked/resources');
const archive = path.join(resources, 'app.asar');
const file = name => extractFile(archive, name.split('/').join(path.sep));
const pkg = JSON.parse(file('package.json'));
for (const [name, expected] of Object.entries({ 'electron-updater': '6.8.9', semver: '7.7.3' })) {
  const dependency = JSON.parse(file(`node_modules/${name}/package.json`));
  if (dependency.version !== expected || pkg.dependencies[name] !== expected) throw new Error(`Missing runtime dependency: ${name}`);
  file(`node_modules/${name}/${dependency.main || 'index.js'}`);
}
const config = yaml.load(await readFile(path.join(resources, 'app-update.yml'), 'utf8'));
if (config.provider !== 'github' || config.owner !== 'Forest-Wood' || config.repo !== 'DesktopPlay' || config.token) throw new Error('Unexpected updater provider');
if (!file('dist-electron/update-helper.ps1').length) throw new Error('Update helper missing');
console.log(`Verified packaged updater runtime v${pkg.version}`);
