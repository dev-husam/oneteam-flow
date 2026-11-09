/**
 * Removes location, camera and other embedded metadata from uploaded photos (JPEG and PNG), so a progress photo
 * never leaks where it was taken. Pure and dependency-free. The EXIF orientation is the one tag worth keeping:
 * without it a portrait photo from a phone would show up sideways, so a minimal EXIF segment with only the
 * orientation is written back.
 */
export const METADATA_STRIPPABLE_MIME = ['image/jpeg', 'image/png'] as const;
export const canStripMetadata = (mimeType: string): boolean => (METADATA_STRIPPABLE_MIME as readonly string[]).includes(mimeType.toLowerCase());

const be16 = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const be32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

/** Orientation (1–8) from an EXIF payload ("Exif\0\0" + TIFF), or 1 when absent or unreadable. */
function exifOrientation(seg: Uint8Array): number {
  if (seg.length < 14 || ascii(seg, 0, 4) !== 'Exif') return 1;
  const t = 6;
  const little = ascii(seg, t, t + 2) === 'II';
  if (!little && ascii(seg, t, t + 2) !== 'MM') return 1;
  const u16 = (o: number) => (little ? seg[o]! | (seg[o + 1]! << 8) : be16(seg, o));
  const u32 = (o: number) => (little ? (seg[o]! | (seg[o + 1]! << 8) | (seg[o + 2]! << 16) | (seg[o + 3]! << 24)) >>> 0 : be32(seg, o));
  if (u16(t + 2) !== 42) return 1;
  const ifd = t + u32(t + 4);
  if (ifd + 2 > seg.length) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > seg.length) return 1;
    if (u16(e) === 0x0112 && u16(e + 2) === 3) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

/** APP1 segment holding only the orientation tag. */
function orientationSegment(orientation: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // marker, length 34, "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00 | (orientation >> 8), orientation & 0xff, 0x00, 0x00, // Orientation, SHORT, 1 value
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
}

function stripJpeg(src: Uint8Array): { bytes: Uint8Array; removed: number } | null {
  if (src.length < 4 || src[0] !== 0xff || src[1] !== 0xd8) return null;
  const out: Uint8Array[] = [src.subarray(0, 2)];
  let orientation = 1;
  let removed = 0;
  let pos = 2;
  let insertAt = 1; // index in `out` after which the orientation segment goes
  while (pos < src.length) {
    if (src[pos] !== 0xff) return null;
    while (src[pos] === 0xff && pos < src.length) pos++; // fill bytes
    const marker = src[pos++]!;
    if (marker === 0xd9) { out.push(Uint8Array.from([0xff, 0xd9])); break; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { out.push(Uint8Array.from([0xff, marker])); continue; }
    if (pos + 2 > src.length) return null;
    const len = be16(src, pos);
    if (len < 2 || pos + len > src.length) return null;
    const segment = src.subarray(pos - 2, pos + len); // marker + length + payload
    if (marker === 0xda) { out.push(src.subarray(pos - 2)); break; } // scan data to the end, copied untouched
    // Keep everything that is needed to decode (and the ICC colour profile, JFIF and Adobe colour tags);
    // drop EXIF/XMP (APP1), other application data (APP2 that is not ICC, APP3–APP13, APP15) and comments.
    const isIcc = marker === 0xe2 && ascii(src, pos + 2, pos + 13) === 'ICC_PROFILE';
    const drop = marker === 0xe1 || (marker >= 0xe3 && marker <= 0xed) || marker === 0xef || marker === 0xfe || (marker === 0xe2 && !isIcc);
    const keep = !drop;
    if (marker === 0xe1 && orientation === 1) orientation = exifOrientation(src.subarray(pos + 2, pos + len));
    if (keep) {
      out.push(segment);
      if (marker === 0xe0) insertAt = out.length - 1;
    } else removed += segment.length;
    pos += len;
  }
  if (orientation > 1) out.splice(insertAt + 1, 0, orientationSegment(orientation));
  const total = out.reduce((n, p) => n + p.length, 0);
  const bytes = new Uint8Array(total);
  let o = 0;
  for (const p of out) { bytes.set(p, o); o += p.length; }
  return { bytes, removed };
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function stripPng(src: Uint8Array): { bytes: Uint8Array; removed: number } | null {
  if (src.length < 8 || !PNG_SIG.every((v, i) => src[i] === v)) return null;
  const out: Uint8Array[] = [src.subarray(0, 8)];
  let removed = 0;
  let pos = 8;
  let sawEnd = false;
  while (pos < src.length) {
    if (pos + 12 > src.length) return null;
    const len = be32(src, pos);
    const type = ascii(src, pos + 4, pos + 8);
    const end = pos + 12 + len;
    if (end > src.length) return null;
    if (PNG_DROP.has(type)) removed += end - pos;
    else out.push(src.subarray(pos, end));
    pos = end;
    if (type === 'IEND') { sawEnd = true; break; }
  }
  if (!sawEnd) return null;
  const total = out.reduce((n, p) => n + p.length, 0);
  const bytes = new Uint8Array(total);
  let o = 0;
  for (const p of out) { bytes.set(p, o); o += p.length; }
  return { bytes, removed };
}

/**
 * Returns the image without embedded metadata, or null when the bytes are not a well-formed image of that type
 * (the caller rejects the upload) or the type cannot be stripped.
 */
export function stripImageMetadata(mimeType: string, bytes: Uint8Array): { bytes: Uint8Array; removed: number } | null {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg': return stripJpeg(bytes);
    case 'image/png': return stripPng(bytes);
    default: return null;
  }
}
