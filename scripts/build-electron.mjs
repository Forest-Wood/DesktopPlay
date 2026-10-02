import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
await build({ entryPoints: ['src/main/main.ts'], outfile: 'dist-electron/main.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron'], sourcemap: true });
await build({ entryPoints: ['src/preload/index.ts'], outfile: 'dist-electron/preload.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron'], sourcemap: true });
await copyFile('build/uninstall-helper.ps1', 'dist-electron/uninstall-helper.ps1');
