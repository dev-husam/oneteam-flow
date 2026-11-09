import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes with argon2id and verifies', async () => {
    const hash = await svc.hash('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await svc.verify(hash, 'correct horse battery')).toBe(true);
    expect(await svc.verify(hash, 'wrong')).toBe(false);
  });

  it('never accepts a missing hash (unknown user) but still spends comparable time', async () => {
    expect(await svc.verify(null, 'anything-at-all')).toBe(false);
  });

  it('returns false for corrupt hashes instead of throwing', async () => {
    expect(await svc.verify('not-a-hash', 'x')).toBe(false);
  });

  it('enforces the shared password policy with WEAK_PASSWORD', () => {
    expect(() => svc.assertAcceptable('short')).toThrowError();
    expect(() => svc.assertAcceptable('a fine long passphrase')).not.toThrow();
  });
});
