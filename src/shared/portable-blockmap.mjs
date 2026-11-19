import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const RABIN_POLY = 0xbfe6b8a5bf378d83n;
const RABIN_DEGREE = 63n;
const RABIN_MIN = 8192;
const RABIN_AVG = 16384;
const RABIN_MAX = 32768;
const RABIN_WINDOW = 64;
const RABIN_HASH_MASK = RABIN_AVG - 1;
const MASK_64 = (1n << 64n) - 1n;
const MAX_GUNZIP_BYTES = 4 * 1024 * 1024;

export const PORTABLE_BLOCKMAP_VERSION = '2';
export const PORTABLE_BLOCKMAP_HASH = 'sha256-18';
export const DEFAULT_COALESCE_GAP_BYTES = 64 * 1024;
export const DEFAULT_MAX_DOWNLOAD_RATIO = 0.85;

function gf2Mod(value, poly) {
  let rem = value;
  const polyBit = RABIN_DEGREE;
  let bit = BigInt(rem.toString(2).length - 1);
  while (bit >= polyBit && rem !== 0n) {
    if ((rem >> bit) & 1n) rem ^= poly << (bit - polyBit);
    bit -= 1n;
  }
  return rem;
}

function gf2AppendByte(hash, byte) {
  let rem = (hash << 8n) | BigInt(byte);
  for (let shift = 7n; shift >= 0n; shift -= 1n) {
    if ((rem >> (RABIN_DEGREE + shift)) & 1n) rem ^= RABIN_POLY << shift;
  }
  return rem;
}

function buildTables() {
  const pushHi = new Int32Array(256);
  const pushLo = new Int32Array(256);
  const popHi = new Int32Array(256);
  const popLo = new Int32Array(256);

  // Compute x^(63*8) mod POLY once for sliding-window byte removal.
  let windowFactor = 1n;
  for (let i = 0; i < RABIN_WINDOW - 1; i++) {
    windowFactor = gf2AppendByte(windowFactor, 0);
  }

  for (let b = 0; b < 256; b++) {
    // PUSH[b] = (b * x^63) mod POLY (for shifting out the top byte at bit 55..62).
    const shifted = BigInt(b) << RABIN_DEGREE;
    const pushVal = (shifted ^ gf2Mod(shifted, RABIN_POLY)) & MASK_64;
    pushHi[b] = Number((pushVal >> 32n) & 0xffffffffn) | 0;
    pushLo[b] = Number(pushVal & 0xffffffffn) | 0;

    // POP[b] = (b * x^((WINDOW-1)*8)) mod POLY.
    let popVal = 0n;
    for (let bit = 0n; bit < 8n; bit += 1n) {
      if ((BigInt(b) >> bit) & 1n) popVal ^= windowFactor << bit;
    }
    popVal = gf2Mod(popVal, RABIN_POLY);
    popHi[b] = Number((popVal >> 32n) & 0xffffffffn) | 0;
    popLo[b] = Number(popVal & 0xffffffffn) | 0;
  }

  return { pushHi, pushLo, popHi, popLo };
}

const { pushHi: PUSH_HI, pushLo: PUSH_LO, popHi: POP_HI, popLo: POP_LO } = buildTables();

export async function buildPortableBlockMap(filePath, options = {}) {
  const { signal, name = path.basename(filePath) } = options;
  const checksums = [];
  const sizes = [];
  let totalSize = 0;

  const chunkBuf = Buffer.allocUnsafe(RABIN_MAX);
  let chunkN = 0;
  let hi = 0;
  let lo = 0;
  const win = new Uint8Array(RABIN_WINDOW);
  let wpos = 0;

  function emitChunk() {
    const digest = createHash('sha256')
      .update(chunkBuf.subarray(0, chunkN))
      .digest()
      .subarray(0, 18)
      .toString('base64');
    checksums.push(digest);
    sizes.push(chunkN);
    chunkN = 0;
    hi = 0;
    lo = 0;
    win.fill(0);
    wpos = 0;
  }

  function processByte(b) {
    chunkBuf[chunkN++] = b;
    if (chunkN <= RABIN_MIN - RABIN_WINDOW) return;
    if (chunkN <= RABIN_MIN) {
      win[wpos] = b;
      wpos = (wpos + 1) % RABIN_WINDOW;
      const top = (hi >>> 23) & 0xff;
      const nhi = ((hi << 8) | (lo >>> 24)) & 0x7fffffff;
      const nlo = ((lo << 8) | b) & 0xffffffff;
      hi = (nhi ^ PUSH_HI[top]) | 0;
      lo = (nlo ^ PUSH_LO[top]) | 0;
      if (chunkN === RABIN_MIN && (lo & RABIN_HASH_MASK) === RABIN_HASH_MASK) emitChunk();
      return;
    }
    const old = win[wpos];
    win[wpos] = b;
    wpos = (wpos + 1) % RABIN_WINDOW;
    hi = (hi ^ POP_HI[old]) | 0;
    lo = (lo ^ POP_LO[old]) | 0;
    const top = (hi >>> 23) & 0xff;
    const nhi = ((hi << 8) | (lo >>> 24)) & 0x7fffffff;
    const nlo = ((lo << 8) | b) & 0xffffffff;
    hi = (nhi ^ PUSH_HI[top]) | 0;
    lo = (nlo ^ PUSH_LO[top]) | 0;
    if ((lo & RABIN_HASH_MASK) === RABIN_HASH_MASK || chunkN >= RABIN_MAX) emitChunk();
  }

  const stream = createReadStream(filePath, { highWaterMark: 256 * 1024 });
  try {
    for await (const raw of stream) {
      signal?.throwIfAborted();
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      totalSize += buf.length;
      for (let i = 0; i < buf.length; i++) processByte(buf[i]);
    }
    signal?.throwIfAborted();
    if (chunkN > 0) emitChunk();
  } finally {
    stream.destroy();
  }

  return {
    version: PORTABLE_BLOCKMAP_VERSION,
    hash: PORTABLE_BLOCKMAP_HASH,
    files: [{ name, offset: 0, size: totalSize, checksums, sizes }],
  };
}

export function encodePortableBlockMap(blockMap) {
  return zlib.gzipSync(Buffer.from(JSON.stringify(blockMap), 'utf8'), { level: 9 });
}

export async function writePortableBlockMap(inFile, outFile = `${inFile}.blockmap`) {
  const blockMap = await buildPortableBlockMap(inFile);
  const encoded = encodePortableBlockMap(blockMap);
  await writeFile(outFile, encoded);
  return { blockMap, bytes: encoded.length, outFile };
}

export function parsePortableBlockMap(compressed, expectedName, expectedSize) {
  const raw = zlib.gunzipSync(compressed, { maxOutputLength: MAX_GUNZIP_BYTES });
  const parsed = JSON.parse(raw.toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid portable blockmap payload');
  }
  if (parsed.version !== PORTABLE_BLOCKMAP_VERSION || parsed.hash !== PORTABLE_BLOCKMAP_HASH) {
    throw new Error('Unsupported portable blockmap version or hash algorithm');
  }
  if (!Array.isArray(parsed.files) || parsed.files.length !== 1) {
    throw new Error('Portable blockmap must contain exactly one file entry');
  }
  const file = parsed.files[0];
  if (!file || typeof file !== 'object' || file.offset !== 0 || typeof file.name !== 'string' || !file.name) {
    throw new Error('Invalid portable blockmap file entry');
  }
  if (expectedName !== undefined && file.name !== expectedName) {
    throw new Error('Portable blockmap file name mismatch');
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new Error('Invalid portable blockmap file size');
  }
  if (expectedSize !== undefined && file.size !== expectedSize) {
    throw new Error('Portable blockmap file size mismatch');
  }
  if (!Array.isArray(file.checksums) || !Array.isArray(file.sizes) || file.checksums.length === 0 || file.checksums.length !== file.sizes.length) {
    throw new Error('Invalid portable blockmap chunk arrays');
  }
  let sum = 0;
  for (let i = 0; i < file.sizes.length; i++) {
    const size = file.sizes[i];
    const checksum = file.checksums[i];
    if (!Number.isSafeInteger(size) || size <= 0 || size > RABIN_MAX * 2 || typeof checksum !== 'string' || checksum.length !== 24) {
      throw new Error('Invalid portable blockmap chunk metadata');
    }
    sum += size;
  }
  if (sum !== file.size) {
    throw new Error('Portable blockmap chunk sizes do not match total file size');
  }
  return parsed;
}

export function planPortablePatch(oldFile, newFile, options = {}) {
  const coalesceGapBytes = options.coalesceGapBytes ?? DEFAULT_COALESCE_GAP_BYTES;
  const maxDownloadRatio = options.maxDownloadRatio ?? DEFAULT_MAX_DOWNLOAD_RATIO;

  const oldIndex = new Map();
  let oldOffset = oldFile.offset ?? 0;
  for (let i = 0; i < oldFile.checksums.length; i++) {
    const checksum = oldFile.checksums[i];
    const size = oldFile.sizes[i];
    if (!oldIndex.has(checksum)) oldIndex.set(checksum, { offset: oldOffset, size });
    oldOffset += size;
  }

  const rawOps = [];
  let targetOffset = 0;
  for (let i = 0; i < newFile.checksums.length; i++) {
    const checksum = newFile.checksums[i];
    const size = newFile.sizes[i];
    const match = oldIndex.get(checksum);
    if (match && match.size === size) {
      const prev = rawOps[rawOps.length - 1];
      if (prev && prev.kind === 'copy' && prev.sourceOffset + prev.size === match.offset && prev.targetOffset + prev.size === targetOffset) {
        prev.size += size;
      } else {
        rawOps.push({ kind: 'copy', sourceOffset: match.offset, targetOffset, size });
      }
    } else {
      const prev = rawOps[rawOps.length - 1];
      if (prev && prev.kind === 'download' && prev.targetOffset + prev.size === targetOffset) {
        prev.size += size;
      } else {
        rawOps.push({ kind: 'download', targetOffset, size });
      }
    }
    targetOffset += size;
  }

  // Merge adjacent download ops separated by small copy gaps to minimize HTTP Range RTTs.
  const ops = [];
  for (const op of rawOps) {
    if (op.kind === 'download' && ops.length >= 2) {
      const gap = ops[ops.length - 1];
      const prevDownload = ops[ops.length - 2];
      if (gap.kind === 'copy' && prevDownload.kind === 'download' && gap.size <= coalesceGapBytes) {
        ops.pop();
        prevDownload.size += gap.size + op.size;
        continue;
      }
    }
    const prev = ops[ops.length - 1];
    if (prev && prev.kind === 'download' && op.kind === 'download' && prev.targetOffset + prev.size === op.targetOffset) {
      prev.size += op.size;
    } else {
      ops.push({ ...op });
    }
  }

  let copyBytes = 0;
  let downloadBytes = 0;
  let downloadRequests = 0;
  for (const op of ops) {
    if (op.kind === 'copy') copyBytes += op.size;
    else {
      downloadBytes += op.size;
      downloadRequests += 1;
    }
  }

  const totalSize = newFile.size;
  if (copyBytes + downloadBytes !== totalSize) {
    throw new Error('Portable patch plan size mismatch');
  }
  if (totalSize > 0 && downloadBytes / totalSize >= maxDownloadRatio) {
    return null;
  }

  return { ops, totalSize, copyBytes, downloadBytes, downloadRequests };
}

