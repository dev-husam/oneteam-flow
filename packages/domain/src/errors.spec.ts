import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ERROR_MESSAGES_EN } from './errors.js';

describe('error catalog', () => {
  it('has an English fallback for every code', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_MESSAGES_EN[code].length).toBeGreaterThan(5);
    }
  });
});
