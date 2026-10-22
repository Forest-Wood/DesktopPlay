export interface ReleasePlan { baseVersion: string; changeTypes: string[]; version: string; notesFile: string; notes: string }
export function stable(value: unknown): string;
export function nextVersion(baseVersion: string, changeTypes: string[]): string;
export function announcement(value: unknown): string;
export function readReleasePlan(root: string, options?: { required?: boolean; latestVersion?: string; tag?: string }): Promise<ReleasePlan | null>;
export function prepareRelease(root: string, options: { baseVersion: string; changeTypes: string[]; notesFile?: string }): Promise<ReleasePlan>;
