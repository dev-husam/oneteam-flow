import { ERROR_CODES, ERROR_MESSAGES_EN } from '@pt/domain';
import { describe, expect, it } from 'vitest';
import { AppError } from './app-error.js';

describe('AppError', () => {
  it('maps every shared error code to a valid HTTP status with the English fallback message', () => {
    for (const code of ERROR_CODES) {
      const err = new AppError(code);
      expect(err.status).toBeGreaterThanOrEqual(400);
      expect(err.status).toBeLessThan(600);
      expect(err.message).toBe(ERROR_MESSAGES_EN[code]);
    }
  });

  it('uses 401 for authentication problems and 403 for permission problems', () => {
    expect(new AppError('UNAUTHENTICATED').status).toBe(401);
    expect(new AppError('SESSION_REVOKED').status).toBe(401);
    expect(new AppError('FORBIDDEN').status).toBe(403);
    expect(new AppError('NOT_FOUND').status).toBe(404);
  });

  it('carries details', () => {
    expect(new AppError('VALIDATION_FAILED', { fields: [] }).details).toEqual({ fields: [] });
  });
});
