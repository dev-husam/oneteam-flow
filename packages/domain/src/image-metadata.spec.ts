import { describe, expect, it } from 'vitest';
import { canStripMetadata, stripImageMetadata } from './image-metadata.js';

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A TIFF/EXIF payload with orientation and a GPS pointer, little- or big-endian. */
function exif(orientation: number, little: boolean): number[] {
  const u16 = (n: number) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) => (little ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
  const entries = [...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u16(0x8825), ...u16(4), ...u32(1), ...u32(1234)]; // Orientation + GPS IFD pointer
  return [...text('Exif'), 0, 0, ...text(little ? 'II' : 'MM'), ...u16(42), ...u32(8), ...u16(2), ...entries, 0, 0, 0, 0, ...text('GPS-LAT-48.8584N-2.2945E')];
}

const scan = [0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9]; // SOS header + "entropy data" + EOI
function jpeg(parts: number[][]): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, ...parts.flat(), ...scan]);
}
const asText = (b: Uint8Array) => String.fromCharCode(...b);

describe('stripImageMetadata: JPEG', () => {
  it('removes EXIF with GPS, XMP, IPTC and comments but keeps the picture data', () => {
    const src = jpeg([
      seg(0xe0, [...text('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
      seg(0xe1, exif(1, false)),
      seg(0xe1, [...text('http://ns.adobe.com/xap/1.0/'), 0, ...text('<x:xmpmeta GPSLatitude/>')]),
      seg(0xed, [...text('Photoshop 3.0'), 0, ...text('IPTC-secret')]),
      seg(0xfe, text('shot at my home')),
      seg(0xdb, [0, 1, 2, 3, 4, 5, 6, 7]),
    ]);
    const out = stripImageMetadata('image/jpeg', src)!;
    const t = asText(out.bytes);
    expect(t).not.toContain('GPS');
    expect(t).not.toContain('Exif');
    expect(t).not.toContain('xmpmeta');
    expect(t).not.toContain('IPTC');
    expect(t).not.toContain('my home');
    expect(t).toContain('JFIF');
    expect([...out.bytes.slice(-6)]).toEqual([0x3f, 0, 0x12, 0x34, 0xff, 0xd9]); // scan data untouched
    expect(out.removed).toBeGreaterThan(40);
    expect(out.bytes.length).toBe(src.length - out.removed);
  });

  it('keeps the orientation (both byte orders) as a minimal EXIF, without any other tag', () => {
    for (const little of [true, false]) {
      const out = stripImageMetadata('image/jpeg', jpeg([seg(0xe0, [...text('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), seg(0xe1, exif(6, little))]))!;
      const t = asText(out.bytes);
      expect(t).not.toContain('GPS');
      const at = t.indexOf('Exif');
      expect(at).toBeGreaterThan(0);
      // marker FFE1, length 34, then orientation 6 in the single IFD entry
      expect([...out.bytes.slice(at - 4, at - 2)]).toEqual([0xff, 0xe1]);
      expect(out.bytes[at + 6 + 8 + 2 + 8]).toBe(0);
      expect(out.bytes[at + 6 + 8 + 2 + 9]).toBe(6);
      expect(t.indexOf('JFIF')).toBeLessThan(at); // JFIF header stays first
    }
  });

  it('keeps an ICC colour profile but drops other APP2 data', () => {
    const out = stripImageMetadata('image/jpeg', jpeg([seg(0xe2, [...text('ICC_PROFILE'), 0, 1, 1, 9, 9]), seg(0xe2, [...text('MPF'), 0, 1, 2, 3])]))!;
    const t = asText(out.bytes);
    expect(t).toContain('ICC_PROFILE');
    expect(t).not.toContain('MPF');
  });

  it('is a no-op for a clean file and rejects malformed ones', () => {
    const clean = jpeg([seg(0xdb, [0, 1, 2, 3])]);
    expect(stripImageMetadata('image/jpeg', clean)!.removed).toBe(0);
    expect(stripImageMetadata('image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0xff, 1, 2]))).toBeNull(); // segment longer than the file
    expect(stripImageMetadata('image/jpeg', Uint8Array.from([1, 2, 3, 4, 5]))).toBeNull();
    expect(stripImageMetadata('image/jpeg', Uint8Array.from([0xff, 0xd8, 1, 2, 3, 4]))).toBeNull();
  });
});

function pngChunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [len >>> 24, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...text(type), ...data, 0, 0, 0, 0]; // CRC is not checked
}
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('stripImageMetadata: PNG', () => {
  it('drops text, EXIF and time chunks and keeps the image chunks', () => {
    const src = Uint8Array.from([
      ...PNG_SIG, ...pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]), ...pngChunk('tEXt', text('Location\0home')), ...pngChunk('eXIf', text('GPS')),
      ...pngChunk('tIME', [7, 234, 11, 6, 8, 0, 0]), ...pngChunk('IDAT', [1, 2, 3]), ...pngChunk('IEND', []),
    ]);
    const out = stripImageMetadata('image/png', src)!;
    const t = asText(out.bytes);
    for (const gone of ['tEXt', 'eXIf', 'tIME', 'Location', 'GPS']) expect(t).not.toContain(gone);
    for (const kept of ['IHDR', 'IDAT', 'IEND']) expect(t).toContain(kept);
    expect(out.bytes.length).toBe(src.length - out.removed);
  });

  it('rejects truncated PNGs and unsupported types', () => {
    expect(stripImageMetadata('image/png', Uint8Array.from([...PNG_SIG, ...pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])]))).toBeNull(); // no IEND
    expect(stripImageMetadata('image/png', Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(stripImageMetadata('image/webp', Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(canStripMetadata('IMAGE/JPEG')).toBe(true);
    expect(canStripMetadata('image/heic')).toBe(false);
  });
});
