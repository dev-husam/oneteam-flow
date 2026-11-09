'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { ADMIN_STATS_KEY } from './admin-gate';
import { StatCard } from './stat-card';

export function AdminDashboard() {
  const t = useTranslations('admin.dashboard');
  const format = useFormatter();
  const stats = useQuery({ queryKey: ADMIN_STATS_KEY, queryFn: () => api.admin.stats() });
  const health = useQuery({ queryKey: ['admin', 'health'], queryFn: () => api.admin.health(), refetchInterval: 30_000 });
  const s = stats.data;
  const n = (v: number | undefined) => (v === undefined ? '—' : format.number(v));

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={health.data && <Badge tone={health.data.status === 'ok' ? 'ok' : 'danger'}>{t(`health.${health.data.status}`)}</Badge>} />
      {!s ? <Skeleton className="h-32" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard index={0} label={t('users')} value={n(s.users.total)} hint={t('usersHint', { week: s.users.new7d, month: s.users.new30d })} />
          <StatCard index={1} label={t('organizations')} value={n(s.organizations.ACTIVE)} hint={t('orgsHint', { suspended: s.organizations.SUSPENDED ?? 0 })} />
          <StatCard index={2} label={t('memberships')} value={n(s.activeMemberships)} />
          <StatCard index={3} label={t('suspendedUsers')} value={n(s.users.suspended)} />
        </div>
      )}
      {s && Object.keys(s.organizationsByCategory).length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">{t('byCategory')}</span>
          {Object.entries(s.organizationsByCategory).map(([key, count]) => (
            <Badge key={key} tone="accent">{t(`category.${key}` as 'category.fitness')}: {format.number(count)}</Badge>
          ))}
        </div>
      )}
    </>
  );
}
