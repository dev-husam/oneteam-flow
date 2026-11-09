import { describe, expect, it } from 'vitest';
import { checkPassword } from './password-policy.js';

describe('checkPassword', () => {
  it('accepts a long, varied password', () => {
    expect(checkPassword('correct horse battery staple')).toEqual([]);
  });

  it('rejects short passwords', () => {
    expect(checkPassword('short1')).toContain('TOO_SHORT');
  });

  it('rejects very long passwords', () => {
    expect(checkPassword('a1b2c3d4e5'.repeat(20))).toContain('TOO_LONG');
  });

  it('rejects low-variety passwords', () => {
    expect(checkPassword('aaaaaaaaaaaa')).toContain('TOO_SIMPLE');
  });

  it('rejects common passwords case-insensitively', () => {
    expect(checkPassword('Password123')).toContain('COMMON_PASSWORD');
  });

  it('rejects passwords containing the email name', () => {
    expect(checkPassword('husam-maher-2026', 'husam.maher@example.com')).toEqual([]);
    expect(checkPassword('my-husam.maher-pass', 'husam.maher@example.com')).toContain(
      'CONTAINS_EMAIL',
    );
  });
});
