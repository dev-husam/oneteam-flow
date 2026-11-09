import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LineChart } from '@/components/ui/line-chart';
import { fromDateInput, toDateInput } from './dates';

const base = { label: 'Body weight over time', unit: 'kg', formatDate: (iso: string) => iso.slice(0, 10), formatValue: (v: number) => String(v) };

describe('LineChart', () => {
  it('draws one point per entry with an accessible name, and nothing without data', () => {
    const { container, rerender } = render(<LineChart {...base} points={[{ at: '2026-10-01T10:00:00Z', value: 92 }, { at: '2026-10-08T10:00:00Z', value: 90 }, { at: '2026-10-15T10:00:00Z', value: 89 }]} />);
    expect(screen.getByRole('img', { name: 'Body weight over time (kg)' })).toBeInTheDocument();
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(container.querySelector('path')).not.toBeNull();
    rerender(<LineChart {...base} points={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('handles a single entry and a flat series without producing invalid coordinates', () => {
    const one = render(<LineChart {...base} points={[{ at: '2026-10-01T10:00:00Z', value: 90 }]} />);
    expect(one.container.querySelector('path')).toBeNull(); // a line needs two points
    const flat = render(<LineChart {...base} points={[{ at: '2026-10-01T10:00:00Z', value: 90 }, { at: '2026-10-08T10:00:00Z', value: 90 }]} />);
    for (const c of [...one.container.querySelectorAll('circle'), ...flat.container.querySelectorAll('circle')]) {
      expect(Number(c.getAttribute('cx'))).not.toBeNaN();
      expect(Number(c.getAttribute('cy'))).not.toBeNaN();
    }
  });

  it('draws the target line only when there is a target', () => {
    const points = [{ at: '2026-10-01T10:00:00Z', value: 92 }, { at: '2026-10-08T10:00:00Z', value: 90 }];
    expect(render(<LineChart {...base} points={points} target={85} />).container.querySelectorAll('line[stroke-dasharray]')).toHaveLength(1);
    expect(render(<LineChart {...base} points={points} />).container.querySelectorAll('line[stroke-dasharray]')).toHaveLength(0);
  });
});

describe('date inputs', () => {
  it('a chosen day means the end of that day in the user’s time zone, and round-trips', () => {
    const iso = fromDateInput('2026-11-09');
    expect(new Date(iso).getHours()).toBe(23);
    expect(toDateInput(iso)).toBe('2026-11-09');
    expect(toDateInput(null)).toBe('');
  });
});
