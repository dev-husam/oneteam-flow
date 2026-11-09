'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MessageReport, ReportStatusKey } from '@pt/api-client';
import { ShieldAlert } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { useOrg } from '@/lib/org/org-context';
import { useCursorList } from '@/lib/use-cursor-list';
import { messagingKey } from './realtime-provider';

const TONE = { OPEN: 'warn', DISMISSED: 'neutral', ACTIONED: 'ok' } as const;
const STATUS_LABEL = { OPEN: 'statusOpen', DISMISSED: 'statusDismissed', ACTIONED: 'statusActioned' } as const;

function ReportCard({ r }: { r: MessageReport }) {
  const t = useTranslations('messaging');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, slug } = useOrg();
  const [note, setNote] = useState('');
  const resolve = useMutation({
    mutationFn: (outcome: 'DISMISSED' | 'ACTIONED') => api.org(orgId).messaging.reports.resolve(r.id, { outcome, note: note.trim() || undefined }),
    onSuccess: async () => { toast(t('resolved'), 'success'); await queryClient.invalidateQueries({ queryKey: messagingKey(orgId, 'reports') }); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Card className="anim-rise">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TONE[r.status]}>{t(STATUS_LABEL[r.status])}</Badge>
          <Badge tone="neutral">{t(`reportReasons.${r.reason}`)}</Badge>
          <span className="ms-auto text-xs text-muted">{format.dateTime(new Date(r.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
        <blockquote className="whitespace-pre-wrap break-words rounded-md border border-line bg-surface-2 px-3 py-2 text-sm">{r.snapshot.body || '—'}</blockquote>
        {r.snapshot.attachments.length > 0 && <p className="text-xs text-muted">{t('snapshotFiles', { names: r.snapshot.attachments.map((a) => a.fileName).join(', ') })}</p>}
        <p className="text-sm text-ink-2">
          {t('reportedPerson', { name: '' })}<Link href={`/o/${slug}/members/${r.reported.membershipId}`} className="font-medium hover:text-link">{r.reported.fullName}</Link>
          {' · '}{t('reportedBy', { name: r.reporter.fullName })}
        </p>
        {r.note && <p className="text-sm text-ink-2">“{r.note}”</p>}
        {r.status === 'OPEN' ? (
          <div className="space-y-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('resolutionNote')} aria-label={t('resolutionNote')} rows={2} maxLength={500} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" loading={resolve.isPending && resolve.variables === 'DISMISSED'} disabled={resolve.isPending} onClick={() => resolve.mutate('DISMISSED')}>{t('dismiss')}</Button>
              <Button loading={resolve.isPending && resolve.variables === 'ACTIONED'} disabled={resolve.isPending} onClick={() => resolve.mutate('ACTIONED')}>{t('actioned')}</Button>
            </div>
            <p className="text-xs text-muted">{t('reviewHint')}</p>
          </div>
        ) : (
          <p className="text-sm text-muted">{r.resolvedBy}{r.resolutionNote ? ` · ${r.resolutionNote}` : ''}</p>
        )}
      </CardBody>
    </Card>
  );
}

/** Owners and admins review what people reported. Each report shows the one message, never the conversation. */
export function MessageReportsPage() {
  const t = useTranslations('messaging');
  const { orgId } = useOrg();
  const [status, setStatus] = useState<ReportStatusKey | ''>('OPEN');
  const list = useCursorList(messagingKey(orgId, 'reports', status), (cursor) => api.org(orgId).messaging.reports.list({ status: status || undefined, cursor, limit: 20 }));
  return (
    <>
      <PageHeader title={t('reviewTitle')} description={t('reviewSubtitle')} actions={
        <Select aria-label={t('reviewTitle')} value={status} onChange={(e) => setStatus(e.target.value as ReportStatusKey | '')} className="w-44">
          <option value="OPEN">{t('statusOpen')}</option>
          <option value="">{t('filterAll')}</option>
        </Select>
      } />
      <div className="space-y-4">
        {list.isPending && <Skeleton className="h-40" />}
        {list.isError && <ErrorAlert error={list.error} />}
        {!list.isPending && !list.isError && list.items.length === 0 && <Card><EmptyState icon={ShieldAlert} title={t('reviewEmpty')}>{t('reviewEmptyBody')}</EmptyState></Card>}
        {list.items.map((r) => <ReportCard key={r.id} r={r} />)}
        <LoadMore hasNextPage={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
      </div>
    </>
  );
}
