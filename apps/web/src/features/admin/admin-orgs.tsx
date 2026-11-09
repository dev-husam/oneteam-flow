'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { OrganizationDesign } from './admin-designs';
import { OrganizationFeatures } from './admin-features';
import { useErrorMessage } from '@/lib/errors';
import { useCursorList } from '@/lib/use-cursor-list';
import { useDebounced } from '@/lib/use-debounced';

export function AdminOrganizations() {
  const t = useTranslations('admin.orgs');
  const format = useFormatter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'SUSPENDED'>('');
  const search = useDebounced(q.trim());
  const list = useCursorList(['admin', 'orgs', search, status], (cursor) => api.admin.organizations.list({ q: search || undefined, status: status || undefined, cursor, limit: 25 }));
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Card className="anim-rise">
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('search')} className="w-full sm:max-w-xs" />
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={t('filterStatus')} className="w-full sm:w-44">
            <option value="">{t('allStatuses')}</option>
            <option value="ACTIVE">{t('statusActive')}</option>
            <option value="SUSPENDED">{t('statusSuspended')}</option>
          </Select>
        </div>
        {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-11" /><Skeleton className="h-11" /></div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        {!list.isPending && !list.isError && list.items.length === 0 && <EmptyState icon={Building2} title={t('empty')} />}
        {list.items.length > 0 && (
          <Table>
            <THead><tr><TH>{t('name')}</TH><TH>{t('category')}</TH><TH>{t('members')}</TH><TH>{t('status')}</TH><TH>{t('created')}</TH></tr></THead>
            <TBody>
              {list.items.map((o) => (
                <TR key={o.id}>
                  <TD><Link href={`/admin/organizations/${o.id}`} className="font-medium hover:text-link">{o.name}</Link><p className="ltr-isolate text-xs text-muted">/{o.slug}</p></TD>
                  <TD>{t(`categoryName.${o.categoryKey}` as 'categoryName.fitness')}</TD>
                  <TD className="tabular-nums">{format.number(o.memberCount)}</TD>
                  <TD><StatusBadge status={o.status} /></TD>
                  <TD className="text-muted">{format.dateTime(new Date(o.createdAt), { dateStyle: 'medium' })}</TD>
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

export function AdminOrganizationDetail({ orgId }: { orgId: string }) {
  const t = useTranslations('admin.orgs');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const org = useQuery({ queryKey: ['admin', 'org', orgId], queryFn: () => api.admin.organizations.get(orgId) });
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin'] }); toast(t('updated')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (org.isPending) return <Skeleton className="h-64" />;
  if (org.isError) return <ErrorAlert error={org.error} />;
  const o = org.data;
  const suspended = o.status === 'SUSPENDED';
  return (
    <>
      <Link href="/admin/organizations" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t('back')}</Link>
      <PageHeader title={o.name} description={`/${o.slug}`} actions={<StatusBadge status={o.status} />} />
      <Alert tone="info" className="mb-5">{t('privacyNote')}</Alert>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="anim-rise">
          <CardHeader><CardTitle>{t('overview')}</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('category')}</dt><dd>{t(`categoryName.${o.categoryKey}` as 'categoryName.fitness')}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('timezone')}</dt><dd className="ltr-isolate">{o.timezone}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('created')}</dt><dd>{format.dateTime(new Date(o.createdAt), { dateStyle: 'medium' })}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('members')}</dt><dd className="tabular-nums">{Object.entries(o.memberships).map(([s, n]) => `${n} ${s.toLowerCase()}`).join(' · ') || '0'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('groups')}</dt><dd className="tabular-nums">{o._count.groups}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('invitations')}</dt><dd className="tabular-nums">{o._count.invitations}</dd></div>
            </dl>
            <div className="border-t border-line pt-4">
              {suspended
                ? <Button size="sm" variant="secondary" onClick={() => run.mutate(() => api.admin.organizations.activate(o.id))}>{t('activate')}</Button>
                : <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => run.mutateAsync(() => api.admin.organizations.suspend(o.id))}>{t('suspend')}</ConfirmButton>}
              <p className="mt-2 text-xs text-muted">{suspended ? t('suspendedHint') : t('suspendHint')}</p>
            </div>
          </CardBody>
        </Card>
        <Card className="anim-rise" style={{ ['--i' as string]: 1 }}>
          <CardHeader><CardTitle>{t('modules')}</CardTitle></CardHeader>
          <CardBody className="p-0">
            {o.modules.length === 0 && <p className="p-5 text-sm text-muted">{t('noModules')}</p>}
            <ul className="divide-y divide-line">
              {o.modules.map((m) => (
                <li key={m.module.key} className="flex items-center justify-between px-5 py-3">
                  <span className="font-medium">{m.module.key}</span>
                  <span className="flex gap-2"><StatusBadge status={m.enabled ? 'ENABLED' : 'DISABLED'} />{m.module.status === 'DISABLED' && <StatusBadge status="SUSPENDED" />}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <OrganizationFeatures orgId={o.id} />
        <OrganizationDesign orgId={o.id} />
      </div>
    </>
  );
}
