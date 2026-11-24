import type { GeminiBucket, GeminiQuotaState } from './types';

export const GEMINI_WINDOWS: ReadonlyArray<[GeminiBucket, string]> = [
  ['gemini-weekly', 'Gemini 周额度'],
  ['gemini-5h', 'Gemini 5 小时额度'],
];

export function emptyGeminiQuota(): GeminiQuotaState {
  return { status: 'idle', windows: {}, updatedAt: null, error: null };
}

export function demoGeminiQuota(): GeminiQuotaState {
  const now = Date.now();
  return { status: 'ready', planName: 'AI Pro', error: null, updatedAt: new Date(now).toISOString(),
    windows: {
      'gemini-weekly': { remainingPercent: 68, resetsAt: new Date(now + 80 * 3600000).toISOString() },
      'gemini-5h': { remainingPercent: 92, resetsAt: new Date(now + 3 * 3600000).toISOString() },
    } };
}
