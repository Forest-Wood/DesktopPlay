import { afterEach, describe, expect, it } from 'vitest';
import { appendFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CodexCompletionService } from '../../../src/main/services/codex-completion';
import type { CodexCompletionNotice } from '../../../src/shared/types';

const directories: string[] = [], services: CodexCompletionService[] = [];
const root = path.resolve('.tmp');
const instant = Date.parse('2026-10-19T10:00:00Z');
const line = (value: unknown) => `${JSON.stringify(value)}\n`;
const meta = (id = 'thread', source: unknown = 'cli') => line({ type: 'session_meta', payload: { id, source, base_instructions: 'PRIVATE INSTRUCTIONS' } });
const event = (turn_id: string, timestamp = instant, extra: Record<string, unknown> = {}, type = 'task_complete') => line({ timestamp: new Date(timestamp).toISOString(), type: 'event_msg', payload: { type, turn_id, last_agent_message: 'PRIVATE REPLY', ...extra } });

async function fixture(existing?: string, pollMs = 100000) {
  await mkdir(root, { recursive: true });
  const home = await mkdtemp(path.join(root, 'completion-unit-')); directories.push(home);
  const sessions = path.join(home, 'sessions', '2020', '01', '01'); await mkdir(sessions, { recursive: true });
  const file = path.join(sessions, 'rollout-old.jsonl');
  if (existing !== undefined) await writeFile(file, existing);
  const notices: CodexCompletionNotice[] = [], clock = { now: instant };
  const service = new CodexCompletionService({ onNotice: value => notices.push(value), now: () => clock.now, pollMs, watchDirectory: () => { throw new Error('simulate unsupported watch'); } });
  services.push(service); await service.configure(true, home);
  return { service, file, sessions, home, notices, clock };
}
afterEach(async () => {
  for (const service of services.splice(0)) { service.dispose(); await service.drain(); }
  for (const directory of directories.splice(0)) { expect(path.dirname(directory)).toBe(root); await rm(directory, { recursive: true, force: true }); }
});

describe('local Codex completion monitoring', () => {
  it('skips history even at the arm timestamp, resumes an old dated file and emits only identifiers/time', async () => {
    const f = await fixture(meta() + event('old'));
    expect(f.notices).toEqual([]);
    await appendFile(f.file, event('new')); await f.service.check(); await f.service.check();
    expect(f.notices).toEqual([{ id: 'thread:new', completedAt: '2026-10-19T10:00:00.000Z' }]);
    expect(JSON.stringify(f.notices)).not.toContain('PRIVATE');
  });
  it('does not replay a small file prefix or a partial line that existed at startup', async () => {
    const prior = event('old');
    const f = await fixture(meta('s') + prior.slice(0, 25));
    await appendFile(f.file, prior.slice(25) + event('new')); await f.service.check();
    expect(f.notices.map(n => n.id)).toEqual(['s:new']);
  });
  it('joins split UTF-8 and partial lines and skips malformed/oversized rows without losing following completions', async () => {
    const f = await fixture(meta());
    const full = Buffer.from(event('split', instant, { last_agent_message: '完成啦 PRIVATE' }));
    const split = full.indexOf(Buffer.from('完成')) + 1;
    await appendFile(f.file, full.subarray(0, split)); await f.service.check(); expect(f.notices).toHaveLength(0);
    await appendFile(f.file, full.subarray(split, full.length - 1)); await f.service.check(); expect(f.notices).toHaveLength(0);
    await appendFile(f.file, '\nnot-json\n' + 'x'.repeat(1024 * 1024 + 10) + '\n' + event('after')); await f.service.check();
    expect(f.notices.map(n => n.id)).toEqual(['thread:split', 'thread:after']);
  });
  it('accepts the compatible turn name and filters errors, interruption and non-success statuses', async () => {
    const f = await fixture(meta());
    await appendFile(f.file, event('error', instant, { error: { message: 'PRIVATE ERROR' } }) + event('failed', instant, { status: 'failed' }) + event('cancel', instant, {}, 'turn_aborted') + event('cancel') + event('token', instant, {}, 'token_count') + event('done', instant, {}, 'turn_complete'));
    await f.service.check(); expect(f.notices.map(n => n.id)).toEqual(['thread:done']);
  });
  it('covers multiple client sources and excludes subagents/internal/rootless events', async () => {
    const f = await fixture();
    const sources: unknown[] = ['cli', 'vscode', 'exec', 'mcp', { custom: 'codex-desktop' }, { subagent: { thread_spawn: { parent_thread_id: 'root' } } }, 'internal_memory', { internal: 'guardian' }];
    for (let i = 0; i < sources.length; i++) await writeFile(path.join(f.sessions, `${i}.jsonl`), meta(`t${i}`, sources[i]) + event('turn'));
    await writeFile(path.join(f.sessions, 'no-meta.jsonl'), event('orphan'));
    await f.service.check();
    expect(f.notices.map(n => n.id).sort()).toEqual(['t0:turn', 't1:turn', 't2:turn', 't3:turn', 't4:turn']);
  });
  it('deduplicates renamed files, handles truncation/replacement and discovers new nested folders', async () => {
    const f = await fixture(meta());
    await appendFile(f.file, event('one')); await f.service.check();
    const renamed = path.join(f.sessions, 'renamed.jsonl'); await rename(f.file, renamed); await f.service.check();
    await writeFile(renamed, meta() + event('two')); await f.service.check();
    await writeFile(renamed, meta('other') + event('three')); await f.service.check();
    const nested = path.join(f.home, 'sessions', '2030', '12', '31'); await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, 'new.jsonl'), meta('new-client') + event('four')); await f.service.check();
    expect(f.notices.map(n => n.id)).toEqual(['thread:one', 'thread:two', 'other:three', 'new-client:four']);
  });
  it('re-arms without replay and drops events while disabled or after directory changes', async () => {
    const f = await fixture(meta());
    await f.service.configure(false, f.home); expect(f.service.getState().status).toBe('disabled');
    await appendFile(f.file, event('disabled')); await f.service.check();
    f.clock.now += 1000; await f.service.configure(true, f.home);
    await appendFile(f.file, event('enabled', f.clock.now)); await f.service.check();
    const other = path.join(f.home, 'other'); await mkdir(path.join(other, 'sessions'), { recursive: true });
    await f.service.configure(true, other);
    await appendFile(f.file, event('old-dir', f.clock.now));
    await writeFile(path.join(other, 'sessions', 'new.jsonl'), meta('other') + event('new-dir', f.clock.now)); await f.service.check();
    expect(f.notices.map(n => n.id)).toEqual(['thread:enabled', 'other:new-dir']);
  });
  it('does not replay renamed history after the bounded duplicate-id cache rolls over', async () => {
    const f = await fixture(meta());
    await appendFile(f.file, Array.from({ length: 5002 }, (_, i) => event(`turn-${i}`, instant + i)).join(''));
    await f.service.check(); expect(f.notices).toHaveLength(5002);
    await rename(f.file, path.join(f.sessions, 'renamed.jsonl')); await f.service.check();
    expect(f.notices).toHaveLength(5002);
  });
  it('recovers a missing directory with polling and ignores old events copied into it', async () => {
    const f = await fixture(); const home = path.join(f.home, 'late');
    await f.service.configure(true, home); expect(f.service.getState().status).toBe('unavailable');
    await mkdir(path.join(home, 'sessions'), { recursive: true });
    await writeFile(path.join(home, 'sessions', 'new.jsonl'), meta() + event('old-copy', instant - 1000) + event('fresh'));
    await f.service.check(); expect(f.service.getState()).toMatchObject({ status: 'watching', error: null });
    expect(f.notices.map(n => n.id)).toEqual(['thread:fresh']);
  });
  it('falls back to periodic polling and stops timers on dispose', async () => {
    const f = await fixture(meta(), 20);
    await appendFile(f.file, event('polled'));
    const deadline = Date.now() + 3000;
    while (!f.notices.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    expect(f.notices.map(n => n.id)).toEqual(['thread:polled']);
    f.service.dispose(); await f.service.drain();
    await appendFile(f.file, event('after-dispose')); await f.service.check(); expect(f.notices).toHaveLength(1);
  });
  it('cancels an initializing generation before it can notify or attach live timers', async () => {
    const f = await fixture();
    const start = f.service.configure(true, path.join(f.home, 'different'));
    await f.service.configure(false, f.home); await start;
    expect(f.service.getState()).toMatchObject({ status: 'disabled', directory: f.home }); expect(f.notices).toHaveLength(0);
  });
});
