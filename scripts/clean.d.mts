export function cleanProject(root: string, options?: { dryRun?: boolean }): Promise<{
  dryRun: boolean; bytes: number; files: number; targets: string[];
  skipped: { path: string; reason: string }[];
}>;
