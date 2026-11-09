import { describe, expect, it } from 'vitest';
import { checkUpload, matchesMime, sanitizeFileName } from './files.js';

const bytes = (...v: number[]) => Uint8Array.from(v);
const ascii = (s: string, pad = 0) => Uint8Array.from([...new Array(pad).fill(0), ...[...s].map((c) => c.charCodeAt(0))]);

describe('checkUpload', () => {
  it('allows known types within their size caps', () => {
    expect(checkUpload('image/jpeg', 1024)).toEqual({ ok: true, fileClass: 'image' });
    expect(checkUpload('IMAGE/PNG', 10 * 1024 ** 2)).toEqual({ ok: true, fileClass: 'image' });
    expect(checkUpload('video/mp4', 100 * 1024 ** 2)).toEqual({ ok: true, fileClass: 'video' });
  });
  it('rejects unknown types, oversize and empty files', () => {
    for (const mime of ['application/x-msdownload', 'text/html', 'image/svg+xml', 'application/javascript']) expect(checkUpload(mime, 10)).toEqual({ ok: false, reason: 'type_not_allowed' });
    expect(checkUpload('image/jpeg', 10 * 1024 ** 2 + 1)).toEqual({ ok: false, reason: 'too_large' });
    expect(checkUpload('application/pdf', 20 * 1024 ** 2 + 1)).toEqual({ ok: false, reason: 'too_large' });
    expect(checkUpload('image/jpeg', 0)).toEqual({ ok: false, reason: 'empty' });
    expect(checkUpload('image/jpeg', Number.NaN)).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('matchesMime', () => {
  it('recognizes real signatures', () => {
    expect(matchesMime('image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesMime('image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(matchesMime('application/pdf', ascii('%PDF-1.7'))).toBe(true);
    expect(matchesMime('video/mp4', ascii('ftypisom', 4))).toBe(true);
    expect(matchesMime('image/webp', Uint8Array.from([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')]))).toBe(true);
    expect(matchesMime('image/heic', ascii('ftypheic', 4))).toBe(true);
    expect(matchesMime('text/csv', ascii('a,b\n1,2'))).toBe(true);
  });
  it('rejects a disguised file: executable or HTML labelled as an image or document', () => {
    expect(matchesMime('image/jpeg', ascii('MZ\u0090\u0000'))).toBe(false);
    expect(matchesMime('image/png', ascii('<html><script>'))).toBe(false);
    expect(matchesMime('application/pdf', ascii('PK\u0003\u0004'))).toBe(false);
    expect(matchesMime('text/plain', bytes(0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01))).toBe(false); // ELF with NUL bytes
    expect(matchesMime('image/jpeg', new Uint8Array())).toBe(false);
    expect(matchesMime('application/zip', bytes(0x50, 0x4b, 3, 4))).toBe(false); // unknown types never match
  });
});

describe('sanitizeFileName', () => {
  it('strips paths and control characters, and never returns an empty name', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\a\\photo.jpg')).toBe('photo.jpg');
    expect(sanitizeFileName('we"ird<name>.pdf')).toBe('weirdname.pdf');
    expect(sanitizeFileName('re\u0000port\u001f\u007f.pdf')).toBe('report.pdf');
    expect(sanitizeFileName('   ')).toBe('file');
    expect(sanitizeFileName('a'.repeat(500)).length).toBe(200);
  });
});
