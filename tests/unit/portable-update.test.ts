import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { PortableUpdateManager } from '../../src/main/portable-update';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'desktoppet-receipt-')); dirs.push(directory);
  const token = randomUUID(), root = path.join(directory, 'updates'), attempt = path.join(root, `attempt-${token}`), programPath = path.join(directory, 'pet.exe');
  await mkdir(attempt, { recursive: true }); await writeFile(programPath, 'verified-new-program');
  const pending = { token, version: '0.5.4', programPath, attempt, newHash: createHash('sha256').update('verified-new-program').digest('hex'), oldHash: '0'.repeat(64) };
  await writeFile(path.join(root, 'pending.json'), JSON.stringify(pending));
  const manager = new PortableUpdateManager({ programPath, dataDir: directory, exePath: process.execPath, helperPath: programPath });
  return { manager, pending, programPath, attempt };
}
it('acknowledges only the exact version, token and verified executable', async () => {
  const f = await fixture(), receipt = path.join(f.attempt, 'healthy');
  await f.manager.acknowledge('0.5.3', f.pending.token); await f.manager.acknowledge('0.5.4', randomUUID()); await expect(readFile(receipt)).rejects.toThrow();
  await f.manager.acknowledge('0.5.4', f.pending.token); expect(JSON.parse(await readFile(receipt, 'utf8'))).toEqual({ token: f.pending.token, version: '0.5.4' });
});
it('never confirms a changed file and recognizes PowerShell UTF-8 BOM recovery results', async () => {
  const f = await fixture(); await writeFile(f.programPath, 'changed'); await f.manager.acknowledge('0.5.4', f.pending.token); await expect(readFile(path.join(f.attempt, 'healthy'))).rejects.toThrow();
  const result = path.join(f.attempt, 'result.json'); await writeFile(result, '\uFEFF' + JSON.stringify({ token: f.pending.token, status: 'failed' })); expect(await f.manager.previousFailure()).toBe(true);
  await writeFile(result, JSON.stringify({ token: f.pending.token, status: 'success' })); expect(await f.manager.previousFailure()).toBe(false);
});
