/** Sources are client names for root turns, structured objects for subagents. */
export function isRootCodexSource(data: Record<string, unknown>): boolean {
  const source = data.source;
  const custom = source && typeof source === 'object' && !Array.isArray(source) ? source as Record<string, unknown> : null;
  const customRoot = custom && Object.keys(custom).length === 1 && typeof custom.custom === 'string';
  return !data.parent_thread_id
    && !(source !== undefined && typeof source !== 'string' && !customRoot)
    && !(typeof source === 'string' && /^(subagent|internal|guardian|memory)/i.test(source))
    && !(typeof data.thread_source === 'string' && data.thread_source !== 'user');
}
