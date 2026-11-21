/** AI4B4A — bounded, complete PNG decode validation for untrusted uploads.
 * Only 8-bit noninterlaced PNG is accepted in this first upload wave.
 * No SVG, HTML, remote URLs, animation or decompression bombs.
 */
import "server-only";
import { inflateSync } from "node:zlib";
import { BUILD_MEDIA_LIMITS } from "@zoeskoul/build-application";
import { BuildMediaStorageError, type BuildMediaImageInspector } from "@zoeskoul/build-application";

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const PIXEL_LIMIT = 16_000_000;
const MAX_INFLATED = 64 * 1024 * 1024 + 16_384;

function reject(): never { throw new BuildMediaStorageError("BUILD_MEDIA_IMAGE_DECODE_INVALID"); }
function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! * 0x1000000 + (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) + bytes[offset + 3]!) >>> 0;
}
function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc ^= bytes[i]!;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}

/** This verifies decoded scanlines, not just a magic header or an IHDR claim. */
export function inspectPrivatePng(bytes: Uint8Array): Readonly<{
  mimeType: "image/png"; width: number; height: number;
}> {
  if (!(bytes instanceof Uint8Array) || bytes.length < 60 ||
      bytes.length > BUILD_MEDIA_LIMITS.imageBytes ||
      !SIGNATURE.every((b, i) => bytes[i] === b)) reject();
  let offset = 8, seenIHDR = false, seenIDAT = false, endedIDAT = false, seenIEND = false;
  let width = 0, height = 0, channels = 0, palette = false;
  const compressed: Uint8Array[] = [];
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) reject();
    const length = u32(bytes, offset);
    if (length > bytes.length - offset - 12) reject();
    const t = offset + 4, data = offset + 8, next = data + length;
    const type = String.fromCharCode(...bytes.slice(t, t + 4));
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes, t, next) !== u32(bytes, next)) reject();
    offset = next + 4;
    if (!seenIHDR && type !== "IHDR") reject();
    if (seenIEND) reject();
    if (type === "IHDR") {
      if (seenIHDR || length !== 13) reject();
      width = u32(bytes, data); height = u32(bytes, data + 4);
      const depth = bytes[data + 8], color = bytes[data + 9];
      if (width < 1 || height < 1 || width > BUILD_MEDIA_LIMITS.imageDimension ||
          height > BUILD_MEDIA_LIMITS.imageDimension || width * height > PIXEL_LIMIT ||
          depth !== 8 || bytes[data + 10] !== 0 || bytes[data + 11] !== 0 ||
          bytes[data + 12] !== 0) reject();
      const count: Record<number, number> = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4};
      channels = count[color] ?? 0;
      if (!channels) reject();
      palette = color === 3;
      seenIHDR = true;
    } else if (type === "PLTE") {
      if (seenIDAT || !length || length > 768 || length % 3 !== 0) reject();
      palette = false;
    } else if (type === "IDAT") {
      if (endedIDAT || palette || !length) reject();
      seenIDAT = true;
      compressed.push(bytes.subarray(data, next));
    } else if (type === "IEND") {
      if (length !== 0 || !seenIDAT || offset !== bytes.length) reject();
      seenIEND = true;
    } else {
      if (seenIDAT) endedIDAT = true;
      // Unknown critical chunks and animated PNG are intentionally unsupported.
      if (type[0] === type[0]!.toUpperCase() ||
          type === "acTL" || type === "fcTL" || type === "fdAT") reject();
    }
  }
  if (!seenIEND || !seenIDAT) reject();
  const stride = width * channels;
  const expectedLength = height * (stride + 1);
  if (expectedLength > MAX_INFLATED) reject();
  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(compressed), {maxOutputLength: expectedLength + 1});
  } catch { reject(); }
  if (inflated.length !== expectedLength) reject();
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1);
    const filter = inflated[base];
    if (filter === undefined || filter > 4) reject();
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const left = x < channels ? 0 : row[x - channels]!;
      const up = previous[x]!;
      const upperLeft = x < channels ? 0 : previous[x - channels]!;
      const predictor = filter === 0 ? 0 : filter === 1 ? left :
        filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) :
        paeth(left, up, upperLeft);
      row[x] = (inflated[base + 1 + x]! + predictor) & 255;
    }
    previous = row;
  }
  return {mimeType: "image/png", width, height};
}

export const privatePngInspector: BuildMediaImageInspector = {
  async inspect(bytes) { return inspectPrivatePng(bytes); },
};
