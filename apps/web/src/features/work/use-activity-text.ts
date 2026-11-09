'use client';

import type { ActivityItem } from '@pt/api-client';
import { useTranslations } from 'next-intl';

/** Turns an activity verb ("task.commented") into a localized sentence; unknown verbs fall back to a neutral one. */
export function useActivityText() {
  const t = useTranslations('activity');
  return (item: Pick<ActivityItem, 'verb' | 'actorName'>): string => {
    const actor = item.actorName ?? t('someone');
    const key = `verb.${item.verb.replaceAll('.', '_')}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key, { actor }) : t('unknown', { actor });
  };
}
