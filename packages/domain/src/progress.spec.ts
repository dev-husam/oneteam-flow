import { describe, expect, it } from 'vitest';
import { goalProgress, isGoalReached, summarizeSeries } from './progress.js';

const p = (value: number, day: number) => ({ value, at: `2026-01-${String(day).padStart(2, '0')}T08:00:00.000Z` });

describe('summarizeSeries', () => {
  it('handles empty and single-point series', () => {
    expect(summarizeSeries([]).count).toBe(0);
    const one = summarizeSeries([p(80, 1)]);
    expect(one).toMatchObject({ count: 1, change: null, improved: null, min: 80, max: 80 });
  });

  it('sorts by time and computes change, ratio and direction', () => {
    const s = summarizeSeries([p(78, 15), p(82, 1), p(80, 8)], false); // lower is better (weight loss)
    expect(s.first?.value).toBe(82);
    expect(s.latest?.value).toBe(78);
    expect(s).toMatchObject({ change: -4, min: 78, max: 82, improved: true });
    expect(s.changeRatio).toBeCloseTo(-0.0488, 4);
    expect(summarizeSeries([p(78, 15), p(82, 1)], true).improved).toBe(false);
    expect(summarizeSeries([p(78, 15), p(82, 1)]).improved).toBeNull();
  });

  it('does not divide by a zero baseline', () => {
    expect(summarizeSeries([p(0, 1), p(5, 2)]).changeRatio).toBeNull();
  });
});

describe('goalProgress', () => {
  it('measures progress toward a lower and a higher target, clamped to 0..1', () => {
    expect(goalProgress(90, 80, 85)).toBe(0.5);
    expect(goalProgress(60, 100, 70)).toBe(0.25);
    expect(goalProgress(90, 80, 95)).toBe(0); // moved the wrong way
    expect(goalProgress(90, 80, 70)).toBe(1); // overshoot
  });
  it('returns null when there is nothing to measure', () => {
    expect(goalProgress(80, 80, 80)).toBeNull();
    expect(goalProgress(90, 80, null)).toBeNull();
  });
  it('knows when a goal is reached in either direction', () => {
    expect(isGoalReached(90, 80, 79.5)).toBe(true);
    expect(isGoalReached(90, 80, 81)).toBe(false);
    expect(isGoalReached(60, 100, 100)).toBe(true);
    expect(isGoalReached(60, 100, null)).toBe(false);
  });
});
