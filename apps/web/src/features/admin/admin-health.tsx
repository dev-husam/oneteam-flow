'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { StatCard } from './stat-card';

export function AdminHealthPage() {
  const t = useTranslations('admin.health');
  const format = useFormatter();
  const health = useQuery({ queryKey: ['admin', 'health'], queryFn: () => api.admin.health(), refetchInterval: 15_000 });
  if (health.isPending) return <Skeleton className="h-40" />;
  if (health.isError) return <ErrorAlert error={health.error} />;
  const h = health.data;
  const q = h.queues.email;
  const hours = Math.floor(h.process.uptimeSeconds / 3600);
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<Badge tone={h.status === 'ok' ? 'ok' : 'danger'}>{t(`status.${h.status}`)}</Badge>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard index={0} label="MySQL" value={<Badge tone={h.checks.mysql === 'up' ? 'ok' : 'danger'}>{t(`check.${h.checks.mysql}`)}</Badge>} />
        <StatCard index={1} label="Redis" value={<Badge tone={h.checks.redis === 'up' ? 'ok' : 'danger'}>{t(`check.${h.checks.redis}`)}</Badge>} />
        <StatCard index={2} label={t('memory')} value={`${format.number(h.process.rssMb)} MB`} />
        <StatCard index={3} label={t('uptime')} value={t('hours', { count: hours })} />
      </div>
      <h2 className="mb-3 mt-8 text-base font-semibold">{t('queue')}</h2>
      {q ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('waiting')} value={format.number(q.waiting)} />
          <StatCard label={t('active')} value={format.number(q.active)} />
          <StatCard label={t('delayed')} value={format.number(q.delayed)} />
          <StatCard label={t('failed')} value={format.number(q.failed)} hint={q.failed > 0 ? t('failedHint') : undefined} />
        </div>
      ) : <p className="text-sm text-muted">{t('queueUnavailable')}</p>}
    </>
  );
}
