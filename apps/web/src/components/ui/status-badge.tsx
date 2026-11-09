'use client';

import { useTranslations } from 'next-intl';
import { Badge } from './badge';

const TONES: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'accent'> = {
  ACTIVE: 'ok',
  ACCEPTED: 'ok',
  PENDING: 'accent',
  SUSPENDED: 'warn',
  EXPIRED: 'neutral',
  REVOKED: 'neutral',
  REMOVED: 'neutral',
  ARCHIVED: 'neutral',
  PENDING_DELETION: 'danger',
  ENABLED: 'ok',
  DISABLED: 'neutral',
};

/** One mapping from a server status to a colour and a localized label. */
export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('status');
  const key = status as Parameters<typeof t>[0];
  return <Badge tone={TONES[status] ?? 'neutral'}>{t.has(key) ? t(key) : status}</Badge>;
}
