'use client';

import { useId } from 'react';

export interface ChartPoint {
  at: string;
  value: number;
}

interface LineChartProps {
  points: ChartPoint[];
  label: string;
  unit: string;
  /** Optional horizontal target line. */
  target?: number | null;
  formatDate: (iso: string) => string;
  formatValue: (value: number) => string;
}

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 };

/**
 * Dependency-free SVG line chart, labelled as an image. The summary figures and the entries list shown beside
 * it carry the same data as text, so nothing is available only visually.
 */
export function LineChart({ points, label, unit, target, formatDate, formatValue }: LineChartProps) {
  const titleId = useId();
  if (points.length === 0) return null;

  const times = points.map((p) => new Date(p.at).getTime());
  const values = [...points.map((p) => p.value), ...(target != null ? [target] : [])];
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.1, 1);
  const minV = rawMin - spread * 0.1;
  const maxV = rawMax + spread * 0.1;

  const x = (t: number) => PAD.left + (maxT === minT ? (W - PAD.left - PAD.right) / 2 : ((t - minT) / (maxT - minT)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - (v - minV) / (maxV - minV)) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(times[i]!).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [minV + spread * 0.1, (minV + maxV) / 2, maxV - spread * 0.1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId} className="h-auto w-full text-chart-1" style={{ direction: 'ltr' }}>
      <title id={titleId}>{`${label} (${unit})`}</title>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[11px]">
            {formatValue(v)}
          </text>
        </g>
      ))}
      {target != null && (
        <line x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} className="stroke-ok" strokeWidth={1.5} strokeDasharray="5 4" />
      )}
      {points.length > 1 && <path d={path} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) => (
        <circle key={p.at + i} cx={x(times[i]!)} cy={y(p.value)} r={3.5} fill="currentColor" className="stroke-surface" strokeWidth={1.5}>
          <title>{`${formatDate(p.at)}: ${formatValue(p.value)} ${unit}`}</title>
        </circle>
      ))}
      <text x={PAD.left} y={H - 8} className="fill-muted text-[11px]">{formatDate(points[0]!.at)}</text>
      {points.length > 1 && (
        <text x={W - PAD.right} y={H - 8} textAnchor="end" className="fill-muted text-[11px]">{formatDate(points[points.length - 1]!.at)}</text>
      )}
    </svg>
  );
}
