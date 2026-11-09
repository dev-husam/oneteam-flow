'use client';

import { ClipboardCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { useCursorList } from '@/lib/use-cursor-list';

type Status = 'SUBMITTED' | 'REVIEWED' | '';
const TONE = { DRAFT: 'neutral', SUBMITTED: 'warn', REVIEWED: 'ok' } as const;

/** Weekly check-ins of the clients the signed-in staff member looks after: what to review first. */
export function CheckinsPage() {
  const t = useTranslations('checkin');
  const f = useTranslations('fitness');
  const format = useFormatter();
  const { orgId, slug } = useOrg();
  const [status, setStatus] = useState<Status>('SUBMITTED');
  const list = useCursorList(orgKey(orgId, 'fitness', 'checkins', 'queue', status), (cursor) => api.org(orgId).fitness.checkins.list({ status: status || undefined, cursor, limit: 25 }));
  return (
    <>
      <PageHeader title={t('queueTitle')} description={t('queueSubtitle')} />
      <Card className="anim-rise">
        <div className="border-b border-line p-4">
          <Select aria-label={t('filterStatus')} value={status} onChange={(e) => setStatus(e.target.value as Status)} className="w-full sm:w-52">
            <option value="SUBMITTED">{t('toReview')}</option>
            <option value="REVIEWED">{t('status.REVIEWED')}</option>
            <option value="">{t('allStatuses')}</option>
          </Select>
        </div>
        {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        {!list.isPending && !list.isError && list.items.length === 0 && <EmptyState icon={ClipboardCheck} title={t('queueEmpty')}>{t('queueEmptyBody')}</EmptyState>}
        {list.items.length > 0 && (
          <Table>
            <THead><TR><TH>{t('client')}</TH><TH>{t('weekColumn')}</TH><TH>{t('statusLabel')}</TH><TH>{f('metric.weight_kg')}</TH><TH>{t('workoutAdherence')}</TH><TH>{t('nutritionAdherence')}</TH></TR></THead>
            <TBody>
              {list.items.map((c) => (
                <TR key={c.id}>
                  <TD><Link href={`/o/${slug}/checkins/${c.id}`} className="font-medium hover:text-link">{c.clientName}</Link></TD>
                  <TD className="text-muted">{format.dateTime(new Date(`${c.weekStart}T00:00:00`), { dateStyle: 'medium' })}</TD>
                  <TD><Badge tone={TONE[c.status]}>{t(`status.${c.status}`)}</Badge></TD>
                  <TD className="tabular-nums">{c.weightKg ?? '—'}</TD>
                  <TD className="tabular-nums">{c.workoutAdherencePct === null ? '—' : `${c.workoutAdherencePct}%`}</TD>
                  <TD className="tabular-nums">{c.nutritionAdherencePct === null ? '—' : `${c.nutritionAdherencePct}%`}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <LoadMore hasNextPage={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
      </Card>
    </>
  );
}
