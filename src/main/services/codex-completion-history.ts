import { readdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isRootCodexSource } from './codex-completion-source';

export interface HistoryCompletion { thread: string; turn: string; completedAt: number; success: boolean }
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512;

/** Query only lifecycle columns; never select thread_items or conversation text. */
export class CodexCompletionHistory {
  private through = new Map<string, { time: number; turns: Set<string> }>();
  reset(): void { this.through.clear(); }

  read(directory: string, armedAt: number, suppress = false): { available: boolean; completions: HistoryCompletion[] } {
    let files: string[];
    try { files = readdirSync(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { available: false, completions: [] }; throw error; }
    const latest = (prefix: string) => files.filter(name => new RegExp(`^${prefix}_[0-9]+\\.sqlite$`).test(name))
      .sort((a, b) => Number(b.match(/_(\d+)\.sqlite$/)![1]) - Number(a.match(/_(\d+)\.sqlite$/)![1]))[0];
    const historyName = latest('thread_history');
    if (!historyName) return { available: false, completions: [] };
    const stateName = latest('state');
    if (!stateName) throw new Error('missing-thread-metadata');
    const history = new DatabaseSync(path.join(directory, historyName), { readOnly: true, timeout: 50 });
    let state: DatabaseSync | undefined;
    try {
      history.exec('PRAGMA query_only = ON');
      state = new DatabaseSync(path.join(directory, stateName), { readOnly: true, timeout: 50 });
      state.exec('PRAGMA query_only = ON');
      const columns = new Set(state.prepare('PRAGMA table_info(threads)').all().map(row => row.name));
      // Older metadata databases predate thread_source. Source still identifies subagents.
      const metadata = state.prepare(`SELECT source, ${columns.has('thread_source') ? 'thread_source' : 'NULL AS thread_source'} FROM threads WHERE id = ?`);
      const turns = history.prepare(`SELECT thread_id, turn_id, status, error_json IS NOT NULL AS has_error, completed_at
        FROM thread_turns WHERE completed_at >= ? AND status <> 'inProgress'
        ORDER BY completed_at, thread_id, turn_id`).all(Math.floor(armedAt / 1000));
      const completions: HistoryCompletion[] = [];
      for (const row of turns) {
        if (!identifier(row.thread_id) || !identifier(row.turn_id) || typeof row.completed_at !== 'number') continue;
        const previous = this.through.get(row.thread_id);
        if (previous && (row.completed_at < previous.time || (row.completed_at === previous.time && previous.turns.has(row.turn_id)))) continue;
        const remember = () => {
          const through = previous && row.completed_at === previous.time ? previous : { time: row.completed_at as number, turns: new Set<string>() };
          through.turns.add(row.turn_id as string); this.through.set(row.thread_id as string, through);
        };
        if (suppress) { remember(); continue; }
        const data = metadata.get(row.thread_id);
        if (!data || typeof data.source !== 'string') continue;
        const rawSource = data.source.trim();
        let source: unknown = rawSource;
        if (rawSource.startsWith('{') || rawSource.startsWith('[')) { try { source = JSON.parse(rawSource); } catch { continue; } }
        if (!isRootCodexSource({ source, thread_source: data.thread_source })) continue;
        remember();
        completions.push({ thread: row.thread_id, turn: row.turn_id, completedAt: row.completed_at * 1000, success: row.status === 'completed' && row.has_error === 0 });
      }
      return { available: true, completions };
    } finally { state?.close(); history.close(); }
  }
}
