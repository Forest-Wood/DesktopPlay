import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { constants, zstdCompressSync } from 'node:zlib';
import { DeepseekCompletionService } from '../../../src/main/services/deepseek-completion';
import type { CodexCompletionNotice } from '../../../src/shared/types';

const directories: string[] = [], services: DeepseekCompletionService[] = [];
const now = 1792540800000;
const row = (value: unknown) => JSON.stringify(value) + '\n';
const header = (id = 'root', extra = {}) => row({ type: 'session', version: 4, id, createdAt: now - 10000, isSeeded: false, delegationDepth: 0, ...extra });
const end = (turn: number, kind = 'completed', extra = {}) => row({ type: 'turn/end', time: now + turn, seq: turn * 2 + 1, data: { turn, reason: { kind } }, ...extra });
const frame = (text: string) => zstdCompressSync(Buffer.from(text), { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
async function fixture(compressed = false, existing = '') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'desktoppet-dsh-')); directories.push(directory);
  const root = path.join(directory, 'sessions'); await mkdir(path.join(root, 'project', 'root'), { recursive: true });
  const file = path.join(root, 'project', 'root', `session.v4.jsonl${compressed ? '.zstd' : ''}`);
  await writeFile(file, compressed ? frame(header() + existing) : header() + existing);
  const notices: CodexCompletionNotice[] = []; let clock = now;
  const service = new DeepseekCompletionService({ onNotice: notice => notices.push(notice), now: () => clock, pollMs: 100000, watchDirectory: (() => { throw new Error('poll only'); }) as never }); services.push(service);
  await service.configure(true, root);
  return { service, root, file, notices, advance: (time: number) => { clock = time; } };
}
afterEach(async () => { for (const service of services.splice(0)) { service.dispose(); await service.drain(); } await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('DSH v4 metadata completion observer', () => {
  it.each([false, true])('skips initial history, filters unsuccessful ends and deduplicates (%s compressed)', async compressed => {
    const f = await fixture(compressed, end(1)); expect(f.notices).toEqual([]);
    const batch = end(2) + end(2) + ['aborted', 'error', 'blocked', 'interrupted', 'forked', 'max-tokens'].map((kind, i) => end(i + 3, kind)).join('');
    await appendFile(f.file, compressed ? frame(batch) : batch); await f.service.check();
    expect(f.notices).toHaveLength(1); expect(f.notices[0]).toMatchObject({ source: 'deepseek-harness', completedAt: new Date(now + 2).toISOString() });
    expect(f.notices[0].id).not.toContain('root'); expect(f.service.getState().status).toBe('watching');
    await f.service.check(); expect(f.notices).toHaveLength(1);
  });
  it('waits for a full checksum frame, handles consecutive frames and ignores body data', async () => {
    const f = await fixture(true), complete = frame(row({ type: 'assistant/message', data: { message: 'PRIVATE BODY' } }) + end(2));
    await appendFile(f.file, complete.subarray(0, -2)); await f.service.check(); expect(f.notices).toHaveLength(0);
    await appendFile(f.file, Buffer.concat([complete.subarray(-2), frame(end(3))])); await f.service.check();
    expect(f.notices).toHaveLength(2); expect(JSON.stringify(f.notices)).not.toContain('PRIVATE');
  });
  it('handles UTF-8 half lines and oversized body records without losing the following end', async () => {
    const f = await fixture(); const bytes = Buffer.from(end(1));
    await appendFile(f.file, bytes.subarray(0, 15)); await f.service.check(); expect(f.notices).toHaveLength(0);
    await appendFile(f.file, bytes.subarray(15)); await f.service.check(); expect(f.notices).toHaveLength(1);
    await appendFile(f.file, row({ type: 'assistant/message', data: { content: '字'.repeat(400000) } }) + end(2)); await f.service.check(); expect(f.notices).toHaveLength(2);
  });
  it('rejects subagents and seeded inherited ends, while accepting new work after the seed cut', async () => {
    const f = await fixture();
    await mkdir(path.join(f.root, 'project', 'child')); await writeFile(path.join(f.root, 'project', 'child', 'session.v4.jsonl'), header('child', { origin: 'subagent', delegationDepth: 1 }) + end(1));
    await mkdir(path.join(f.root, 'project', 'fork')); await writeFile(path.join(f.root, 'project', 'fork', 'session.v4.jsonl'), header('fork', { isSeeded: true, parentSession: 'root' }) + end(1) + row({ type: 'session/end-seed', seq: 4, data: { inherited: true } }) + end(3));
    await f.service.check(); expect(f.notices).toHaveLength(1); expect(f.notices[0].id).toMatch(/:3$/);
  });
  it('retries missing directories and malformed or unsupported logs, keeping other sessions active', async () => {
    const f = await fixture();
    await writeFile(f.file, header('root', { version: 5 }) + end(1)); await f.service.check(); expect(f.service.getState()).toMatchObject({ status: 'error', error: expect.stringContaining('不兼容') });
    await writeFile(f.file, header() + end(2)); await f.service.check(); expect(f.service.getState().status).toBe('watching'); expect(f.notices).toHaveLength(1);
    const next = path.join(f.root, 'missing'); await f.service.configure(true, next); expect(f.service.getState().status).toBe('unavailable');
    await mkdir(next); await writeFile(path.join(next, 'session.v4.jsonl'), header('later') + end(3)); await f.service.check(); expect(f.notices).toHaveLength(2);
  });
  it('handles replacement, same-size rewriting and compression checksum failure without duplicate delivery', async () => {
    const f = await fixture(true); await appendFile(f.file, frame(end(1))); await f.service.check();
    await rename(f.file, `${f.file}.old`); await writeFile(f.file, Buffer.concat([frame(header()), frame(end(1) + end(2))])); await f.service.check(); expect(f.notices).toHaveLength(2);
    const bad = frame(end(3)); bad[bad.length - 1] ^= 1; await appendFile(f.file, bad); await f.service.check(); expect(f.service.getState().status).toBe('error'); expect(f.notices).toHaveLength(2);
    await writeFile(f.file, Buffer.concat([frame(header()), frame(end(3))])); await f.service.check(); expect(f.notices).toHaveLength(3);
  });
  it('does not replay on enabling, switching directories, or selecting a future format generation', async () => {
    const f = await fixture(); await f.service.configure(false, f.root); await appendFile(f.file, end(2)); await f.service.configure(true, f.root); expect(f.notices).toEqual([]);
    await writeFile(path.join(path.dirname(f.file), 'session.v5.jsonl'), header('root', { version: 5 })); await appendFile(f.file, end(3)); await f.service.check();
    expect(f.service.getState().status).toBe('error'); expect(f.notices).toEqual([]);
  });
  it('invalidates an in-flight read when disabled and drains on disposal', async () => {
    const f = await fixture(true); await appendFile(f.file, frame(end(1))); const checking = f.service.check(); await f.service.configure(false, f.root); await checking;
    expect(f.notices).toEqual([]); f.service.dispose(); await f.service.drain(); expect(f.service.getState().status).toBe('disabled');
  });
  it('drops unscanned hidden completions at the show watermark but accepts later work', async () => {
    const f = await fixture(true); await appendFile(f.file, frame(end(1))); f.advance(now + 2); f.service.discardHiddenHistory();
    await f.service.check(); expect(f.notices).toEqual([]);
    await appendFile(f.file, frame(end(3))); await f.service.check(); expect(f.notices).toHaveLength(1);
  });
});
