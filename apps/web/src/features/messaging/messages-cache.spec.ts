import { describe, expect, it } from 'vitest';
import { isSameDay } from './messages-cache';

describe('isSameDay', () => {
  it('compares calendar days', () => {
    expect(isSameDay(new Date(2026, 10, 7, 1), new Date(2026, 10, 7, 23))).toBe(true);
    expect(isSameDay(new Date(2026, 10, 7), new Date(2026, 10, 8))).toBe(false);
    expect(isSameDay(new Date(2026, 10, 7), new Date(2027, 10, 7))).toBe(false);
  });
});
