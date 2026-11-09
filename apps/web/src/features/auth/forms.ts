import { ApiError } from '@pt/api-client';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/** Maps server validation rule names (class-validator) to our `validation.*` message keys. */
const RULE_TO_KEY: Record<string, string> = {
  isEmail: 'email',
  isNotEmpty: 'required',
  minLength: 'minLength',
  maxLength: 'maxLength',
  matches: 'phone',
  isIn: 'invalid',
  equals: 'mustAccept',
  isBoolean: 'mustAccept',
};

/** Puts server-side field problems onto the matching form fields. Returns true when any were applied. */
export function applyFieldErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, known: string[]): boolean {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED') return false;
  let applied = false;
  for (const issue of error.fields) {
    if (!known.includes(issue.field)) continue;
    const key = RULE_TO_KEY[issue.rules[0] ?? ''] ?? 'invalid';
    setError(issue.field as Path<T>, { type: 'server', message: key });
    applied = true;
  }
  return applied;
}

/** Only same-app absolute paths are allowed as a post-login destination (prevents open redirects). */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('://') ? next : null;
}
