import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

/** Lifecycle-only mock schema: deliberately contains no conversation content tables. */
export function codexHistoryFixture(home: string) {
  const history = new DatabaseSync(path.join(home, 'thread_history_1.sqlite'));
  const state = new DatabaseSync(path.join(home, 'state_5.sqlite'));
  history.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE thread_turns(thread_id TEXT, turn_id TEXT, status TEXT, completed_at INTEGER, error_json TEXT, PRIMARY KEY(thread_id, turn_id));`);
  state.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE threads(id TEXT PRIMARY KEY, source TEXT, thread_source TEXT);`);
  return {
    history, state,
    root(id = 'desktop', source: unknown = 'vscode', threadSource = 'user') {
      state.prepare('INSERT OR REPLACE INTO threads VALUES (?, ?, ?)').run(id, typeof source === 'string' ? source : JSON.stringify(source), threadSource);
    },
    turn(id: string, completedAt: number | null, status = 'completed', thread = 'desktop', error: string | null = null) {
      history.prepare('INSERT OR REPLACE INTO thread_turns VALUES (?, ?, ?, ?, ?)').run(thread, id, status, completedAt === null ? null : Math.floor(completedAt / 1000), error);
    },
    close() { history.close(); state.close(); },
  };
}
