import { afterEach, describe, expect, it } from 'vitest';
import { appendFile, mkdir, mkdtemp, rename, rm, utimes, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import type { watch } from 'node:fs';
import path from 'node:path';
import { ChatgptCompletionService, chatgptLogDirectories, parseChatgptTurnEnd } from '../../../src/main/services/chatgpt-completion';
import type { CodexCompletionNotice } from '../../../src/shared/types';
import { chatgptTurnEnd } from '../../fixtures/chatgpt-notification';

const root = path.resolve('.tmp');
const directories: string[] = [], services: ChatgptCompletionService[] = [];
const instant = Date.parse('2026-10-20T05:45:00Z');
const line = (turn: string, time = instant, thread?: string, host?: string) => chatgptTurnEnd(turn, time, thread, host);
async function fixture(existing = '', pollMs = 100000, watchDirectory: typeof watch = () => { throw new Error('unsupported watcher'); }) {
  await mkdir(root, { recursive: true });
  const home = await mkdtemp(path.join(root, 'work-completion-unit-')); directories.push(home);
  const logs = path.join(home, 'Logs'), dated = path.join(logs, '2026', '10', '20');
  await mkdir(dated, { recursive: true });
  const file = path.join(dated, 'desktop-t0.log'); await writeFile(file, existing);
  const notices: CodexCompletionNotice[] = [], clock = { now: instant };
  const service = new ChatgptCompletionService({ onNotice: notice => notices.push(notice), now: () => clock.now, pollMs, watchDirectory });
  services.push(service); await service.configure(true, [logs]);
  return { home, logs, dated, file, notices, service, clock };
}
afterEach(async () => {
  for (const service of services.splice(0)) { service.dispose(); await service.drain(); }
  for (const directory of directories.splice(0)) { expect(path.dirname(directory)).toBe(root); await rm(directory, { recursive: true, force: true }); }
});

describe('ChatGPT Work native turn-ended metadata', () => {
  it('keeps only thread, turn and time, excluding account/user identities', () => {
    expect(parseChatgptTurnEnd(line('turn'))).toEqual({ thread: 'work-thread', turn: 'turn', time: instant });
    const roots = chatgptLogDirectories(path.resolve('fake-local-app-data'));
    expect(roots).toHaveLength(2); expect(roots[0]).toContain('OpenAI.Codex_2p2nqsd0c76g0');
    expect(roots[1]).toBe(path.resolve('fake-local-app-data', 'Codex', 'Logs'));
  });
  it('rejects Codex, questions, permission requests, worktree failures, suppression and malformed IDs', () => {
    const valid = line('turn');
    for (const invalid of [
      line('turn', instant, 'thread', 'local'), valid.replace('kind=turn-complete', 'kind=question'),
      valid.replace('kind=turn-complete', 'kind=permission'), valid.replace('notificationId=turn-', 'notificationId=worktree-init-failed-'),
      valid.replace('notificationId=turn-', 'notificationId=remote-turn-'), valid.replace('forward show', 'suppressed turn-complete'),
      valid.replace('forward show', 'received turn-complete'), valid.replace('"durable"', 'null'),
      valid.replace('"work-thread"', '[]'), valid.replace('"turn"', '""'), valid.replace('["fake-account",', '['),
      valid.replace('2026-10-20', 'invalid-ts'), valid.replace('notificationId=turn-', 'notificationId=turn-[garbled'),
      valid.trimEnd() + ' trailing=unexpected', 'x'.repeat(65537) + valid,
    ]) expect(parseChatgptTurnEnd(invalid)).toBeNull();
  });
});

describe('ChatGPT Work log monitoring', () => {
  it('skips startup history and old timestamps, emitting only new sanitized native ends', async () => {
    const f = await fixture(line('history'));
    expect(f.service.getState().status).toBe('watching'); expect(f.notices).toEqual([]);
    await appendFile(f.file, line('late-old', instant - 1) + line('new')); await f.service.check();
    expect(f.notices).toEqual([{ id: 'chatgpt-work:["work-thread","new"]', source: 'chatgpt-work', completedAt: new Date(instant).toISOString() }]);
    expect(JSON.stringify(f.notices)).not.toContain('fake-account'); expect(JSON.stringify(f.notices)).not.toContain('fake-user');
  });
  it('watches every active log even when the newest stderr file is empty, including restored conversations', async () => {
    const f = await fixture(); await writeFile(path.join(f.dated, 'desktop-t1.log'), '');
    await appendFile(f.file, line('restored', instant, 'old-conversation')); await f.service.check();
    await writeFile(path.join(f.dated, 'another-main.log'), line('other', instant, 'other-conversation')); await f.service.check();
    expect(f.notices).toHaveLength(2);
  });
  it('accepts native failure/interruption ends, while excluding other sources and event kinds', async () => {
    const f = await fixture();
    // Native events contain no result field. All three have the same supported schema.
    await appendFile(f.file, line('success') + line('failed') + line('interrupted') + line('codex', instant, 'local', 'local') + line('permission').replace('kind=turn-complete', 'kind=permission'));
    await f.service.check(); expect(f.notices.map(n => n.id)).toHaveLength(3);
  });
  it('deduplicates copies and rotation, ordering events from multiple files by time', async () => {
    const f = await fixture();
    await appendFile(f.file, line('later', instant + 1));
    await writeFile(path.join(f.dated, 'z-earlier.log'), line('earlier') + line('later', instant + 1));
    await f.service.check(); expect(f.notices.map(n => n.id)).toEqual(['chatgpt-work:["work-thread","earlier"]', 'chatgpt-work:["work-thread","later"]']);
    await rename(f.file, path.join(f.dated, 'rotated.log'));
    await writeFile(f.file, line('later', instant + 1) + line('next', instant + 2)); await f.service.check();
    expect(f.notices).toHaveLength(3);
  });
  it('handles partial UTF-8 writes and discards an incomplete startup line', async () => {
    const f = await fixture(line('partial-history').slice(0, -5));
    await appendFile(f.file, 'end\n'); await f.service.check(); expect(f.notices).toEqual([]);
    const bytes = Buffer.from(line('turn', instant, '测试会话'));
    const split = bytes.indexOf(Buffer.from('测试')) + 1;
    await appendFile(f.file, bytes.subarray(0, split)); await f.service.check(); expect(f.notices).toEqual([]);
    await appendFile(f.file, bytes.subarray(split)); await f.service.check(); expect(f.notices).toHaveLength(1);
  });
  it('recovers from truncation, replacement, oversized lines and same-mtime appends', async () => {
    const f = await fixture('history\n');
    await appendFile(f.file, 'x'.repeat(70000) + '\n' + line('one')); await f.service.check();
    await writeFile(f.file, line('two', instant + 1)); await f.service.check();
    await rename(f.file, path.join(f.dated, 'old.log'));
    await writeFile(f.file, line('three', instant + 2)); await f.service.check();
    await appendFile(f.file, line('four', instant + 3)); await utimes(f.file, new Date(instant), new Date(instant)); await f.service.check();
    expect(f.notices).toHaveLength(4);
  });
  it('detects equal-length rewrites after an unchanged header with preserved timestamps', async () => {
    const header = 'unchanged-prefix'.repeat(30) + '\n';
    const f = await fixture(header + line('old'));
    await writeFile(f.file, header + line('new')); await utimes(f.file, new Date(instant), new Date(instant));
    await f.service.check(); expect(f.notices).toHaveLength(1);
    await writeFile(f.file, header + line('end')); await utimes(f.file, new Date(instant), new Date(instant));
    await f.service.check(); expect(f.notices).toHaveLength(2);
  });
  it('skips disabled history on reopening and handles source directory changes', async () => {
    const f = await fixture(); await f.service.configure(false, [f.logs]);
    expect(f.service.getState().status).toBe('disabled'); await appendFile(f.file, line('off'));
    await f.service.configure(true, [f.logs]); await f.service.check(); expect(f.notices).toEqual([]);
    await appendFile(f.file, line('on')); await f.service.check(); expect(f.notices).toHaveLength(1);
    const other = path.join(f.home, 'other'); await mkdir(other); const file = path.join(other, 'other.log');
    await writeFile(file, line('existing')); await f.service.configure(true, [other]); expect(f.notices).toHaveLength(1);
    await appendFile(file, line('new-source')); await f.service.check(); expect(f.notices).toHaveLength(2);
  });
  it('recovers when a missing source appears or is recreated, filtering old events', async () => {
    const f = await fixture(), later = path.join(f.home, 'later');
    await f.service.configure(true, [later]); expect(f.service.getState().status).toBe('unavailable');
    await mkdir(later); const file = path.join(later, 'new.log');
    await writeFile(file, line('old', instant - 1) + line('new')); await f.service.check();
    expect(f.service.getState().status).toBe('watching'); expect(f.notices).toHaveLength(1);
    await rm(later, { recursive: true }); await f.service.check(); expect(f.service.getState().status).toBe('unavailable');
    await mkdir(later); await writeFile(file, line('new') + line('recreated', instant + 1)); await f.service.check();
    expect(f.notices).toHaveLength(2);
  });
  it('recovers a lost native watcher, keeps polling and drains after disposal', async () => {
    const watchers: EventEmitter[] = [];
    const watchDirectory = (() => { const watcher = Object.assign(new EventEmitter(), { close() {}, unref() {} }); watchers.push(watcher); return watcher; }) as unknown as typeof watch;
    const f = await fixture('', 20, watchDirectory);
    watchers[0].emit('error', new Error('watch lost'));
    await appendFile(f.file, line('poll-recovery'));
    await expect.poll(() => f.notices.length).toBe(1); expect(watchers.length).toBeGreaterThan(1);
    f.service.dispose(); await f.service.drain(); await appendFile(f.file, line('disposed')); await f.service.check(); expect(f.notices).toHaveLength(1);
  });
});
