import type { GeminiBucket, GeminiQuotaState } from './types';

export const GEMINI_WINDOWS: ReadonlyArray<[GeminiBucket, string]> = [
  ['gemini-argon-wtu-weekly', 'Argon 周额度'],
  ['gemini-weekly', 'Gemini 周额度'],
  ['gemini-5h', 'Gemini 5 小时额度'],
];

export function emptyGeminiQuota(): GeminiQuotaState {
  return { status: 'idle', windows: {}, updatedAt: null, error: null };
}

export function demoGeminiQuota(): GeminiQuotaState {
  const now = Date.now();
  return { status: 'ready', planName: 'AI Pro', error: null, updatedAt: new Date(now).toISOString(),
    windows: Object.fromEntries(GEMINI_WINDOWS.map(([id], i) => [id, {
      remainingPercent: [37, 68, 92][i], resetsAt: new Date(now + [48, 80, 3][i] * 3600000).toISOString(), shared: false,
    }])) };
}
