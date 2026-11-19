import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ConversationNotice } from '../../shared/types';

export const CLIENTS = { antigravity: '桌面 App', 'antigravity-ide': 'IDE', 'antigravity-cli': 'agy CLI' } as const;

// Read only the tagged waiting_steps and requested_interaction fields of CascadeTrajectorySummary.
// Unknown fields (including conversation text, tool arguments and titles) are skipped.
function* fields(bytes: Uint8Array): Generator<[number, Uint8Array | number]> {
  let pos = 0;
  function integer(): number {
    let n = 0;
    for (let i = 0; i < 10 && pos < bytes.length; i++) {
      const b = bytes[pos++]; n += (b & 127) * 2 ** (i * 7);
      if (b < 128) return n;
    }
    throw new Error('invalid protobuf varint');
  }
  while (pos < bytes.length) {
    const tag = integer(), field = Math.floor(tag / 8);
    if (!field) throw new Error('invalid field');
    switch (tag % 8) {
      case 0: yield [field, integer()]; break;
      case 1: pos += 8; break;
      case 5: pos += 4; break;
      case 2: {
        const length = integer(), end = pos + length;
        if (end > bytes.length) throw new Error('invalid field length');
        const value = bytes.subarray(pos, end); pos = end; yield [field, value]; break;
      }
      default: throw new Error('unsupported wire type');
    }
    if (pos > bytes.length) throw new Error('incomplete field');
  }
}

export function waitingSteps(summary: Uint8Array) {
  const results: { index: number; kind: 'question' | 'approval' }[] = [];
  for (const [field, value] of fields(summary)) {
    if (field !== 8 || typeof value === 'number') continue;
    const waiting = new Map(fields(value)), step = waiting.get(1), index = waiting.get(2) ?? 0;
    if (!step || typeof step === 'number' || typeof index !== 'number') continue;
    const payload = new Map(fields(step)), request = payload.get(56);
    if (request && typeof request !== 'number') {
      for (const [type] of fields(request)) {
        if (type === 20 || type === 22) results.push({ index, kind: 'question' });
        else if ([2, 3, 4, 5, 7, 8, 9, 13, 15, 16, 17, 18, 19, 21, 23].includes(type)) results.push({ index, kind: 'approval' });
      }
    } else if (payload.has(154)) results.push({ index, kind: 'question' });
  }
  return results;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export class GeminiWaiting {
  private seen = new Set<string>();
  private cursor = new Map<string, number>();
  constructor(private home: string, private since: number) {}
  scan(onNotice: (event: ConversationNotice) => void): string {
    const status: string[] = [];
    for (const [folder, label] of Object.entries(CLIENTS)) {
      const file = path.join(this.home, folder, 'conversation_summaries.db');
      if (!existsSync(file)) { status.push(label + ' 未发现等待记录'); continue; }
      let db: DatabaseSync | undefined;
      try {
        db = new DatabaseSync(file, { readOnly: true, timeout: 50 });
        const after = this.cursor.get(folder) ?? this.since;
        // Only changed top-level conversations. Keep a small overlap for simultaneous commits.
        const rows = db.prepare(`SELECT conversation_id, last_user_input_step_index AS turn, raw_summary,
          (julianday(last_modified_time) - 2440587.5) * 86400000 AS modified
          FROM conversation_summaries WHERE last_modified_time >= ? AND julianday(last_modified_time) >= julianday(?, 'unixepoch')
          AND coalesce(parent_conversation_id, '') = '' AND coalesce(nesting_depth, 0) = 0
          AND length(raw_summary) BETWEEN 1 AND 4194304 ORDER BY last_modified_time`).iterate(new Date(after - 86400000).toISOString().slice(0,10), after / 1000);
        let latest = after;
        for (const row of rows) {
          if (!(row.raw_summary instanceof Uint8Array) || typeof row.modified !== 'number') continue;
          latest = Math.max(latest, row.modified);
          for (const step of waitingSteps(row.raw_summary)) {
            const id = hash([row.conversation_id, row.turn, step.index, step.kind].join('/'));
            if (this.seen.has(id)) continue;
            this.seen.add(id);
            onNotice({ source: 'antigravity', kind: step.kind, id, occurredAt: new Date(row.modified).toISOString() });
          }
        }
        this.cursor.set(folder, Math.max(this.since, latest - 2000));
        status.push(label + ' 等待监听中');
      } catch { status.push(label + ' 暂无法识别等待状态'); }
      finally { db?.close(); }
    }
    while (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value!);
    return status.join(' · ');
  }
}

export function conversationTurn(home: string, conversation: string): { child: boolean; turn: string } | undefined {
  for (const folder of Object.keys(CLIENTS)) {
    const file = path.join(home, folder, 'conversation_summaries.db');
    if (!existsSync(file)) continue;
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(file, { readOnly: true, timeout: 50 });
      const row = db.prepare('SELECT parent_conversation_id, nesting_depth, last_user_input_step_index, last_user_input_time FROM conversation_summaries WHERE conversation_id = ?').get(conversation);
      if (row) return { child: Boolean(row.parent_conversation_id) || Number(row.nesting_depth) > 0,
        turn: String(row.last_user_input_step_index ?? row.last_user_input_time ?? '') };
    } catch (error) {
      // Another installed client may use an older schema. Continue with the other profiles.
      if (!(error instanceof Error) || !/no such (column|table)/i.test(error.message)) throw error;
    } finally { db?.close(); }
  }
  return undefined;
}
