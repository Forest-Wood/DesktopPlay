import { it, expect, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { GeminiQuotaService, quotaWindows } from '../../../src/main/services/gemini-quota';
import { waitingSummary as waiting, SUMMARY_TABLE } from '../../fixtures/gemini-summary';
import { GeminiWaiting, conversationTurn, CLIENTS } from '../../../src/main/services/gemini-waiting';
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
