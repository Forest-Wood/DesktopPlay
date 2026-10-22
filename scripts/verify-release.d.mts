export function digest(filename: string, algorithm: string, encoding?: 'hex' | 'base64'): Promise<string>;
export function verifyRelease(directory: string, version: string, writeChecksums?: boolean, expectedNotes?: string): Promise<string[]>;
