import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, generateSecret, otpauthUri, stepAt, totpForStep, verifyTotp } from './totp.js';

// RFC 6238 appendix B, SHA-1 seed "12345678901234567890" (6-digit truncation of the 8-digit reference values).
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const VECTORS: [number, string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

describe('TOTP (RFC 6238)', () => {
  it.each(VECTORS)('matches the reference code at t=%i', (t, code) => {
    expect(totpForStep(RFC_SECRET, stepAt(t * 1000))).toBe(code);
  });

  it('round-trips base32', () => {
    const raw = Buffer.from('hello world, this is a secret');
    expect(base32Decode(base32Encode(raw)).equals(raw)).toBe(true);
    expect(() => base32Decode('not*base32')).toThrow();
  });

  it('generates 160-bit secrets that are unique', () => {
    const a = generateSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateSecret()).not.toBe(a);
  });

  it('accepts the previous, current and next step but not older or newer ones', () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    for (const offset of [-1, 0, 1]) expect(verifyTotp(RFC_SECRET, totpForStep(RFC_SECRET, step + offset), now)).toBe(step + offset);
    expect(verifyTotp(RFC_SECRET, totpForStep(RFC_SECRET, step - 2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpForStep(RFC_SECRET, step + 2), now)).toBeNull();
  });

  it('refuses to accept the same step twice (replay protection)', () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    const code = totpForStep(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, now, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, code, now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpForStep(RFC_SECRET, step - 1), now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpForStep(RFC_SECRET, step + 1), now, step)).toBe(step + 1);
  });

  it('rejects malformed codes', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 345']) expect(verifyTotp(RFC_SECRET, bad, 0)).toBeNull();
  });

  it('builds an otpauth URI authenticator apps understand', () => {
    const uri = otpauthUri('Personal Trainer', 'sara@example.com', 'ABC234');
    expect(uri).toBe('otpauth://totp/Personal%20Trainer:sara%40example.com?secret=ABC234&issuer=Personal%20Trainer&algorithm=SHA1&digits=6&period=30');
  });
});
