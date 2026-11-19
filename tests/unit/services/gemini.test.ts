import { it, expect, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { GeminiQuotaService, quotaWindows } from '../../../src/main/services/gemini-quota';
import { waitingSummary as waiting, SUMMARY_TABLE } from '../../fixtures/gemini-summary';
import { GeminiWaiting, conversationTurn, CLIENTS } from '../../../src/main/services/gemini-waiting';
import { GeminiNotices } from '../../../src/main/services/gemini-notices';
import type { ConversationNotice } from '../../../src/shared/types';

const dirs: string[] = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const expiry = '2026-11-18T05:00:00Z';
it('separates local and CLI buckets, missing, disabled, shared and zero', () => {
  const sample = { groups: [{ buckets: [
    { bucketId: 'gemini-argon-wtu-weekly', remainingFraction: 0, resetTime: expiry },
    { id: 'gemini-weekly', remaining: { case: 'remainingFraction', value: .72 } },
    { id: 'gemini-5h', remaining_fraction: .21, reset_time: expiry },
    { id: 'unrelated', remainingFraction: 1 },
  ] }] };
  const a = quotaWindows({ response: sample }), b = quotaWindows({ status: 'SUCCESS', command: { name: 'usage', data: sample } });
  expect(a).toEqual(b);
  expect(Object.values(a).map(w => w.remainingPercent)).toEqual([0,72,21]);
  expect(a['gemini-5h']?.resetsAt).toBe(new Date(expiry).toISOString());
  expect(quotaWindows({groups:[{buckets:[{id:'gemini-5h',disabled:true}]}]})).toEqual({});
  expect(quotaWindows({groups:[{buckets:[{id:'gemini-argon-wtu-weekly',sharedWith:'gemini-weekly', disabled:true}]}]})['gemini-argon-wtu-weekly']).toMatchObject({shared:true, remainingPercent:null});
  expect(quotaWindows({ groups: [{ description: 'Models within this group: Gemini 4 Argon, Gemini Flash', buckets: [
    { id: 'gemini-weekly', remainingFraction: .4 }
  ] }] })['gemini-argon-wtu-weekly']?.shared).toBe(true);
  expect(() => quotaWindows({status:'FAILURE',command:{name:'usage', data:sample}})).toThrow();
});
it('uses the signed-in CLI when local is closed, keeps the last success across failures, then refreshes after reset', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-18T04:59:59Z'));
  const fresh = (remaining: number) => ({groups:[{buckets:[{id:'gemini-5h',remaining_fraction:remaining,reset_time:expiry}]}]});
  const local = vi.fn().mockRejectedValue(new Error('closed'));
  const cli = vi.fn().mockResolvedValueOnce(fresh(.38)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(fresh(1));
  const svc = new GeminiQuotaService(local, cli, () => {});
  await Promise.all([svc.refresh(),svc.refresh()]);
  expect(cli).toHaveBeenCalledTimes(1); const old = svc.getState();
  vi.setSystemTime(new Date('2026-11-18T05:00:01Z'));
  await svc.refresh(); expect(svc.getState()).toMatchObject({status:'error', windows:old.windows, updatedAt:old.updatedAt});
  await svc.refresh(); expect(svc.getState().windows['gemini-5h']?.remainingPercent).toBe(100);
  local.mockResolvedValueOnce(fresh(.63)); await svc.refresh(); expect(cli).toHaveBeenCalledTimes(3);
});

it.each(Object.keys(CLIENTS))('reads explicit questions and approvals in %s once per turn and ignores history and children', async folder => {
  const home = await mkdtemp(path.join(os.tmpdir(),'DesktopPet-T024-')); dirs.push(home);
  await mkdir(path.join(home,folder));
  const db = new DatabaseSync(path.join(home,folder,'conversation_summaries.db'));
  try {
    db.exec(SUMMARY_TABLE);
    const insert = db.prepare('INSERT OR REPLACE INTO conversation_summaries VALUES (?, ?, NULL, ?, ?, 0, ?)');
    const now = Date.now(), time = (delta:number) => new Date(now + delta).toISOString();
    insert.run('past',0,time(-5000),'',waiting(22,1)); insert.run('child',1,time(10),'parent',waiting(21,1));
    insert.run('task',1,time(100),'',waiting(22,5));
    const notices: ConversationNotice[] = [], watcher = new GeminiWaiting(home,now);
    const poll = () => watcher.scan(n => notices.push(n));
    poll(); poll(); expect(notices.map(n => n.kind)).toEqual(['question']);
    insert.run('task',1,time(200),'',waiting(21,6)); poll(); poll();
    insert.run('task',2,time(300),'',waiting(22,5)); poll();
    expect(notices.map(n => n.kind)).toEqual(['question','approval','question']);
    expect(new Set(notices.map(n => n.id)).size).toBe(3);
    expect(conversationTurn(home,'child')?.child).toBe(true);
    expect(conversationTurn(home,'task')).toEqual({child:false,turn:'2'});
  } finally { db.close(); }
});

const FULL_SUMMARY_TABLE = `CREATE TABLE conversation_summaries (
  conversation_id TEXT PRIMARY KEY,
  step_count INTEGER NOT NULL DEFAULT 0,
  last_modified_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '',
  parent_conversation_id TEXT NOT NULL DEFAULT '',
  nesting_depth INTEGER NOT NULL DEFAULT 0,
  not_fully_idle NUMERIC NOT NULL DEFAULT 0,
  killed NUMERIC NOT NULL DEFAULT 0,
  last_user_input_time TEXT NOT NULL DEFAULT '',
  last_user_input_step_index INTEGER NOT NULL DEFAULT -1,
  raw_summary BLOB
)`;

it('detects completions from conversation_summaries.db without hook, ignores history/children/killed/waiting and respects hidden discard', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'DesktopPet-T029-')); dirs.push(home);
  await mkdir(path.join(home, 'antigravity'));
  const db = new DatabaseSync(path.join(home, 'antigravity', 'conversation_summaries.db'));
  try {
    db.exec(FULL_SUMMARY_TABLE);
    const upsert = db.prepare('INSERT OR REPLACE INTO conversation_summaries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const now = Date.now(), iso = (delta: number) => new Date(now + delta).toISOString();
    // Baseline rows: one already idle, one currently running.
    upsert.run('old-idle', 6, iso(-5000), 'CASCADE_RUN_STATUS_IDLE', '', 0, 0, 0, iso(-6000), -1, null);
    upsert.run('active-1', 4, iso(-1000), 'CASCADE_RUN_STATUS_RUNNING', '', 0, 1, 0, iso(-2000), -1, null);
    const notices: ConversationNotice[] = [];
    const watcher = new GeminiWaiting(home, now, { completion: true, attention: true });
    watcher.scan(n => notices.push(n));
    expect(notices).toEqual([]);
    // Running conversation finishes -> emits completion once.
    upsert.run('active-1', 8, iso(100), 'CASCADE_RUN_STATUS_IDLE', '', 0, 0, 0, iso(-2000), -1, null);
    watcher.scan(n => notices.push(n));
    watcher.scan(n => notices.push(n));
    expect(notices.map(n => n.kind)).toEqual(['completion']);
    // Metadata-only touch (same step_count & turn) must not re-emit.
    upsert.run('active-1', 8, iso(200), 'CASCADE_RUN_STATUS_IDLE', '', 0, 0, 0, iso(-2000), -1, null);
    watcher.scan(n => notices.push(n));
    expect(notices.length).toBe(1);
    // Fast new conversation starts and finishes between polls.
    upsert.run('fast-1', 2, iso(300), 'CASCADE_RUN_STATUS_IDLE', '', 0, 0, 0, iso(250), -1, null);
    // Subagent and killed conversations must be ignored.
    upsert.run('sub-1', 4, iso(310), 'CASCADE_RUN_STATUS_IDLE', 'fast-1', 1, 0, 0, iso(250), -1, null);
    upsert.run('killed-1', 4, iso(320), 'CASCADE_RUN_STATUS_IDLE', '', 0, 0, 1, iso(250), -1, null);
    // User-only step (step_count === ustep + 1) must not emit yet.
    upsert.run('active-1', 9, iso(330), 'CASCADE_RUN_STATUS_IDLE', '', 0, 0, 0, iso(325), 8, null);
    watcher.scan(n => notices.push(n));
    expect(notices.map(n => n.kind)).toEqual(['completion', 'completion']);
    // Waiting step emits question, NOT completion; after answer & idle emits completion.
    upsert.run('active-1', 11, iso(400), 'CASCADE_RUN_STATUS_IDLE', '', 0, 0, 0, iso(325), 8, waiting(22, 10));
    watcher.scan(n => notices.push(n));
    expect(notices.map(n => n.kind)).toEqual(['completion', 'completion', 'question']);
    upsert.run('active-1', 12, iso(500), 'CASCADE_RUN_STATUS_IDLE', '', 0, 0, 0, iso(325), 8, null);
    watcher.scan(n => notices.push(n));
    expect(notices.map(n => n.kind)).toEqual(['completion', 'completion', 'question', 'completion']);
    // Hidden discard skips completions that happened while hidden.
    upsert.run('hidden-1', 2, iso(600), 'CASCADE_RUN_STATUS_IDLE', '', 0, 0, 0, iso(550), -1, null);
    watcher.discardHiddenHistory(now + 700);
    watcher.scan(n => notices.push(n));
    expect(notices.length).toBe(4);
  } finally { db.close(); }
});

it('relays Antigravity NO_TOOL_CALL with omitted executionNum, deduplicates with DB and suppresses ERROR/USER_CANCELED', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'DesktopPet-T029-hook-')); dirs.push(root);
  const home = path.join(root, 'home'), dataDir = path.join(root, 'data');
  await mkdir(path.join(home, 'antigravity'), { recursive: true });
  const db = new DatabaseSync(path.join(home, 'antigravity', 'conversation_summaries.db'));
  const notices: ConversationNotice[] = [];
  const svc = new GeminiNotices(home, dataDir, path.resolve('build/gemini-hook.ps1'), n => notices.push(n), () => {});
  try {
    db.exec(FULL_SUMMARY_TABLE);
    const upsert = db.prepare('INSERT OR REPLACE INTO conversation_summaries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    await svc.configure(true, true, true);
    const script = path.join(dataDir, 'integrations', 'gemini', 'stop.ps1');
    const relay = (payload: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
      child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('hook failed')));
      child.stdin.end(JSON.stringify(payload));
    });
    const now = new Date(Date.now() + 50).toISOString();
    // Normal Antigravity 2.0 Stop payload: NO_TOOL_CALL and omitted executionNum (protojson default 0), plus matching DB row.
    upsert.run('conv-ok', 4, now, 'CASCADE_RUN_STATUS_IDLE', '', 0, 0, 0, now, -1, null);
    await relay({ conversationId: 'conv-ok', terminationReason: 'NO_TOOL_CALL', fullyIdle: true, error: '' });
    // Cancelled turn with matching DB IDLE row must be suppressed.
    upsert.run('conv-cancel', 4, now, 'CASCADE_RUN_STATUS_IDLE', '', 0, 0, 0, now, -1, null);
    await relay({ conversationId: 'conv-cancel', terminationReason: 'USER_CANCELED', fullyIdle: true, error: '' });
    // Wait for next poll tick (2s) to process inbox + DB in the same tick.
    await new Promise(r => setTimeout(r, 2400));
    expect(notices.map(n => n.kind)).toEqual(['completion']);
  } finally {
    svc.pause(); await svc.drain(); db.close();
  }
});
