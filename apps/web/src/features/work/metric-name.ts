'use client';

import type { MetricDefinition } from '@pt/api-client';
import { useTranslations } from 'next-intl';

/** Built-in (module) measurements are translated by key; an organization's own measurement keeps the name it was given. */
export function useMetricName() {
  const t = useTranslations('fitness');
  return (m: Pick<MetricDefinition, 'key' | 'name' | 'system'>): string => {
    const key = `metric.${m.key}` as Parameters<typeof t>[0];
    return m.system && t.has(key) ? t(key) : m.name;
  };
}
