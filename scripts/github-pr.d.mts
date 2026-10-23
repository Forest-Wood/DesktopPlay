export interface PullRequestPayload { title: string; head: string; base: string; body: string; draft: boolean }
export interface PullRequestSummary { created: boolean; number: number; url: string; head: string; headSha: string; base: string; draft: boolean }
export function validatePullRequest(value: unknown): PullRequestPayload;
export function ensurePullRequest(input: unknown, options?: { fetchImpl?: typeof fetch; getCredential?: () => string | Promise<string> }): Promise<PullRequestSummary>;
export function runCli(args: string[], options?: { output?: (text: string) => void; create?: (input: unknown) => Promise<PullRequestSummary> }): Promise<void>;
