// Minimal CascadeTrajectorySummary containing a single requested interaction and step index.
export function waitingSummary(type: number, index: number): Buffer {
  const field = (tag: number, bytes: number[]) => {
    const key = tag * 8 + 2;
    const prefix = key < 128 ? [key] : [key % 128 + 128, Math.floor(key / 128)];
    return [...prefix, bytes.length, ...bytes];
  };
  return Buffer.from(field(8, [...field(1, field(56, field(type, []))), 16, index]));
}
export const SUMMARY_TABLE = `CREATE TABLE conversation_summaries (conversation_id TEXT PRIMARY KEY,
  last_user_input_step_index INT, last_user_input_time TEXT, last_modified_time TEXT,
  parent_conversation_id TEXT, nesting_depth INT, raw_summary BLOB)`;
