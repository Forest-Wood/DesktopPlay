import { execFileSync } from 'node:child_process';
import { lstat, readdir, realpath, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outputs = ['dist', 'dist-electron', 'test-results', 'playwright-report', 'coverage'];

export async function cleanProject(root, { dryRun = false } = {}) {
  root = path.resolve(root);
  const actualRoot = await realpath(root);
  if (actualRoot.toLowerCase() !== root.toLowerCase()) throw new Error('Refusing a linked project root');
  const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  if (path.resolve(gitRoot).toLowerCase() !== root.toLowerCase()) throw new Error('Expected the Git repository root');
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean).map(name => name.toLowerCase());
  const report = { dryRun, bytes: 0, files: 0, targets: [], skipped: [] };
  const inspect = async relative => {
    const absolute = path.resolve(root, relative);
    const contained = path.relative(root, absolute);
    if (!contained || contained === '..' || contained.startsWith(`..${path.sep}`) || path.isAbsolute(contained)) throw new Error('Path outside project');
    let current = root;
    for (const part of contained.split(path.sep)) {
      current = path.join(current, part);
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error('Directory links and symbolic links are protected');
    }
    return { absolute, info: await lstat(absolute) };
  };
  const candidates = [...outputs];
  try {
    const temp = await inspect('.tmp');
    if (temp.info.isDirectory()) candidates.push(...(await readdir(temp.absolute)).filter(name => /^smoke-[a-z0-9-]+$/i.test(name)).map(name => `.tmp/${name}`));
  } catch (error) {
    if (error.code !== 'ENOENT') report.skipped.push({ path: '.tmp', reason: error.message });
  }
  for (const relative of candidates) {
    try {
      const key = relative.toLowerCase();
      if (tracked.some(name => name === key || name.startsWith(`${key}/`))) throw new Error('Contains Git-tracked files');
      const entries = [];
      const collect = async name => {
        const entry = await inspect(name);
        if (entry.info.isDirectory()) for (const child of await readdir(entry.absolute)) await collect(`${name}/${child}`);
        else if (!entry.info.isFile()) throw new Error('Unsupported filesystem entry');
        entries.push({ name, directory: entry.info.isDirectory(), bytes: entry.info.isFile() ? entry.info.size : 0 });
      };
      await collect(relative); // Validate the whole target before removing anything.
      report.targets.push(relative);
      for (const entry of entries) {
        try {
          if (!dryRun) {
            const checked = await inspect(entry.name);
            if (checked.info.isDirectory() !== entry.directory) throw new Error('Entry changed during cleanup');
            if (entry.directory) await rmdir(checked.absolute); else await unlink(checked.absolute);
          }
          report.bytes += entry.bytes;
          if (!entry.directory) report.files++;
        } catch (error) { report.skipped.push({ path: entry.name, reason: error.message }); }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') report.skipped.push({ path: relative, reason: error.message });
    }
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--dry-run')) throw new Error('Usage: npm run clean -- [--dry-run]');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = await cleanProject(root, { dryRun: args.includes('--dry-run') });
  console.log(JSON.stringify(result, null, 2));
  if (result.skipped.length) process.exitCode = 1;
}
