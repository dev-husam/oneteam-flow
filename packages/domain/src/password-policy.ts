export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordViolation =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'TOO_SIMPLE'
  | 'COMMON_PASSWORD'
  | 'CONTAINS_EMAIL';

const COMMON = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd123',
  '1234567890',
  '12345678910',
  'qwertyuiop',
  'qwerty12345',
  'iloveyou123',
  'letmein1234',
  'welcome1234',
  'admin12345',
  'changeme123',
  'abcdefghij',
  '0123456789',
]);

/**
 * Pure password policy shared by the API (authoritative) and the forms (early feedback).
 * Length-first, as recommended by NIST SP 800-63B: no forced symbol rules.
 */
export function checkPassword(password: string, email?: string): PasswordViolation[] {
  const violations: PasswordViolation[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) violations.push('TOO_SHORT');
  if (password.length > PASSWORD_MAX_LENGTH) violations.push('TOO_LONG');
  if (new Set(password).size < 5 && password.length >= PASSWORD_MIN_LENGTH) {
    violations.push('TOO_SIMPLE');
  }
  if (COMMON.has(password.toLowerCase())) violations.push('COMMON_PASSWORD');
  if (email) {
    const local = email.split('@')[0]?.toLowerCase() ?? '';
    if (local.length >= 4 && password.toLowerCase().includes(local)) {
      violations.push('CONTAINS_EMAIL');
    }
  }
  return violations;
}
