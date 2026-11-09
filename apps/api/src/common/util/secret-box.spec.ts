import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SecretBox } from './secret-box.js';

describe('SecretBox', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips and never stores plaintext', () => {
    const box = new SecretBox(key);
    const enc = box.encrypt('JBSWY3DPEHPK3PXP');
    expect(enc).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.decrypt(enc)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a fresh IV each time', () => {
    const box = new SecretBox(key);
    expect(box.encrypt('same')).not.toBe(box.encrypt('same'));
  });

  it('detects tampering and wrong keys', () => {
    const enc = new SecretBox(key).encrypt('secret');
    const parts = enc.split('.');
    parts[2] = Buffer.from('forged-cipher').toString('base64url');
    expect(() => new SecretBox(key).decrypt(parts.join('.'))).toThrow();
    expect(() => new SecretBox(randomBytes(32).toString('base64')).decrypt(enc)).toThrow();
  });

  it('rejects keys of the wrong length', () => {
    expect(() => new SecretBox(Buffer.from('short').toString('base64'))).toThrow();
  });
});
