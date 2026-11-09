'use client';

import type { Exercise } from '@pt/api-client';
import { useLocale } from 'next-intl';

/** The exercise name in the user's language; seeded exercises are bilingual, custom ones fall back to English. */
export function useExerciseName() {
  const locale = useLocale();
  return (e: Pick<Exercise, 'name'>): string => (locale === 'ar' && e.name.ar ? e.name.ar : e.name.en);
}

/** ISO weekdays in display order for the organization's week (Monday first here; the schedule always uses ISO numbers). */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
