/** Upload rules shared by the API (authoritative) and the apps (early feedback). Pure. */
export type FileClass = 'image' | 'document' | 'video';

export const MAX_BYTES: Record<FileClass, number> = { image: 10 * 1024 ** 2, document: 20 * 1024 ** 2, video: 100 * 1024 ** 2 };

const OFFICE = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

export const ALLOWED_MIME: Record<string, FileClass> = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/heic': 'image',
  'application/pdf': 'document', 'text/plain': 'document', 'text/csv': 'document',
  [OFFICE[0]!]: 'document', [OFFICE[1]!]: 'document',
  'video/mp4': 'video', 'video/quicktime': 'video',
};

export type UploadCheck = { ok: true; fileClass: FileClass } | { ok: false; reason: 'type_not_allowed' | 'too_large' | 'empty' };

export function checkUpload(mimeType: string, sizeBytes: number): UploadCheck {
  const fileClass = ALLOWED_MIME[mimeType.toLowerCase()];
  if (!fileClass) return { ok: false, reason: 'type_not_allowed' };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, reason: 'empty' };
  if (sizeBytes > MAX_BYTES[fileClass]) return { ok: false, reason: 'too_large' };
  return { ok: true, fileClass };
}

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

/** Does the beginning of the file look like the type it claims? Declared types alone are never trusted. */
export function matchesMime(mimeType: string, head: Uint8Array): boolean {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg': return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'image/png': return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp': return ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP';
    case 'image/heic': return ascii(head, 4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(ascii(head, 8, 12));
    case 'application/pdf': return ascii(head, 0, 5) === '%PDF-';
    case 'video/mp4':
    case 'video/quicktime': return ascii(head, 4, 8) === 'ftyp';
    case OFFICE[0]:
    case OFFICE[1]: return startsWith(head, [0x50, 0x4b, 0x03, 0x04]); // OOXML is a zip container
    case 'text/plain':
    case 'text/csv': return head.length > 0 && !head.includes(0); // text never contains NUL bytes
    default: return false;
  }
}

/** Display-safe file name: no path parts, no control characters, bounded length. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = [...base]
    .filter((ch) => ch.charCodeAt(0) > 0x1f && ch.charCodeAt(0) !== 0x7f && !'"<>:|?*'.includes(ch))
    .join('')
    .trim()
    .slice(0, 200);
  return clean || 'file';
}
