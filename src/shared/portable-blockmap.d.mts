export const PORTABLE_BLOCKMAP_VERSION: '2';
export const PORTABLE_BLOCKMAP_HASH: 'sha256-18';
export const DEFAULT_COALESCE_GAP_BYTES: number;
export const DEFAULT_MAX_DOWNLOAD_RATIO: number;

export interface PortableBlockMapFile {
  name: string;
  offset: number;
  size: number;
  checksums: string[];
  sizes: number[];
}

export interface PortableBlockMap {
  version: '2';
  hash: 'sha256-18';
  files: [PortableBlockMapFile];
}

export type PortablePatchOperation =
  | { kind: 'copy'; sourceOffset: number; targetOffset: number; size: number }
  | { kind: 'download'; targetOffset: number; size: number };

export interface PortablePatchPlan {
  ops: PortablePatchOperation[];
  totalSize: number;
  copyBytes: number;
  downloadBytes: number;
  downloadRequests: number;
}

export function buildPortableBlockMap(
  filePath: string,
  options?: { signal?: AbortSignal; name?: string },
): Promise<PortableBlockMap>;

export function encodePortableBlockMap(blockMap: PortableBlockMap): Buffer;

export function writePortableBlockMap(
  inFile: string,
  outFile?: string,
): Promise<{ blockMap: PortableBlockMap; bytes: number; outFile: string }>;

export function parsePortableBlockMap(
  compressed: Uint8Array,
  expectedName?: string,
  expectedSize?: number,
): PortableBlockMap;

export function planPortablePatch(
  oldFile: PortableBlockMapFile,
  newFile: PortableBlockMapFile,
  options?: { coalesceGapBytes?: number; maxDownloadRatio?: number },
): PortablePatchPlan | null;
