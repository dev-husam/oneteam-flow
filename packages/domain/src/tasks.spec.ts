import { describe, expect, it } from 'vitest';
import { deriveTaskStatus, isOverdue } from './tasks.js';

describe('deriveTaskStatus', () => {
  it.each([
    [[], 'OPEN'],
    [['PENDING', 'PENDING'], 'OPEN'],
    [['PENDING', 'IN_PROGRESS'], 'IN_PROGRESS'],
    [['DONE', 'PENDING'], 'IN_PROGRESS'],
    [['DONE', 'DONE'], 'DONE'],
    [['DONE'], 'DONE'],
  ] as const)('%j → %s', (assignments, expected) => {
    expect(deriveTaskStatus(assignments)).toBe(expected);
  });
});

describe('isOverdue', () => {
  const now = new Date('2026-06-10T12:00:00Z');
  it('only open or in-progress tasks with a past due date are overdue', () => {
    expect(isOverdue('2026-06-09T00:00:00Z', 'OPEN', now)).toBe(true);
    expect(isOverdue('2026-06-09T00:00:00Z', 'DONE', now)).toBe(false);
    expect(isOverdue('2026-06-09T00:00:00Z', 'CANCELLED', now)).toBe(false);
    expect(isOverdue('2026-06-11T00:00:00Z', 'IN_PROGRESS', now)).toBe(false);
    expect(isOverdue(null, 'OPEN', now)).toBe(false);
  });
});
