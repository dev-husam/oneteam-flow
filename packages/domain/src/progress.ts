/** Pure progress maths shared by the API, web and mobile (no I/O). */
export interface ProgressPoint {
  value: number;
  /** ISO timestamp */
  at: string;
}

export interface SeriesSummary {
  count: number;
  first: ProgressPoint | null;
  latest: ProgressPoint | null;
  min: number | null;
  max: number | null;
  /** latest − first. null with fewer than two points. */
  change: number | null;
  /** change as a share of the first value (e.g. -0.05 = -5 %). null when undefined. */
  changeRatio: number | null;
  /** Whether the change moved in the metric's good direction. null when unknown or no change. */
  improved: boolean | null;
}

/** Summary of a time series. Points may arrive in any order; the series is sorted by time. */
export function summarizeSeries(points: readonly ProgressPoint[], higherIsBetter: boolean | null = null): SeriesSummary {
  const sorted = [...points].sort((a, b) => a.at.localeCompare(b.at));
  if (sorted.length === 0) return { count: 0, first: null, latest: null, min: null, max: null, change: null, changeRatio: null, improved: null };
  const first = sorted[0]!;
  const latest = sorted[sorted.length - 1]!;
  const values = sorted.map((p) => p.value);
  const change = sorted.length > 1 ? round(latest.value - first.value) : null;
  return {
    count: sorted.length,
    first,
    latest,
    min: Math.min(...values),
    max: Math.max(...values),
    change,
    changeRatio: change !== null && first.value !== 0 ? round(change / Math.abs(first.value), 4) : null,
    improved: change === null || change === 0 || higherIsBetter === null ? null : higherIsBetter ? change > 0 : change < 0,
  };
}

/**
 * How far a goal has come, 0..1 (clamped). Works for both directions: baseline 90 → target 80 is "decrease".
 * Returns null when baseline equals target (nothing to measure) or there is no current value.
 */
export function goalProgress(baseline: number, target: number, current: number | null): number | null {
  if (current === null || baseline === target) return null;
  const ratio = (current - baseline) / (target - baseline);
  return Math.min(1, Math.max(0, round(ratio, 4)));
}

export const isGoalReached = (baseline: number, target: number, current: number | null): boolean =>
  current !== null && (target >= baseline ? current >= target : current <= target);

function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
