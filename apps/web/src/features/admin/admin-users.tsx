'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Badge } from '@/components/ui/badge';
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
import { useAuth } from '@/lib/auth/auth-context';
import { useErrorMessage } from '@/lib/errors';
import { useCursorList } from '@/lib/use-cursor-list';
import { useDebounced } from '@/lib/use-debounced';

export function AdminUsers() {
  const t = useTranslations('admin.users');
  const format = useFormatter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'SUSPENDED'>('');
  const search = useDebounced(q.trim());
  const list = useCursorList(['admin', 'users', search, status], (cursor) => api.admin.users.list({ q: search || undefined, status: status || undefined, cursor, limit: 25 }));
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
        {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-11" /><Skeleton className="h-11" /><Skeleton className="h-11" /></div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        {!list.isPending && !list.isError && list.items.length === 0 && <EmptyState icon={Users} title={t('empty')} />}
        {list.items.length > 0 && (
          <Table>
            <THead><tr><TH>{t('name')}</TH><TH>{t('status')}</TH><TH>{t('verified')}</TH><TH>{t('mfa')}</TH><TH>{t('lastLogin')}</TH></tr></THead>
            <TBody>
              {list.items.map((u) => (
                <TR key={u.id}>
                  <TD><Link href={`/admin/users/${u.id}`} className="font-medium hover:text-link">{u.fullName}</Link><p className="ltr-isolate text-xs text-muted">{u.email}</p></TD>
                  <TD><StatusBadge status={u.status} /></TD>
                  <TD>{u.emailVerifiedAt ? <Badge tone="ok">{t('yes')}</Badge> : <Badge>{t('no')}</Badge>}</TD>
                  <TD>{u.mfaEnabled ? <Badge tone="ok">{t('on')}</Badge> : <Badge>{t('off')}</Badge>}</TD>
                  <TD className="text-muted">{u.lastLoginAt ? format.dateTime(new Date(u.lastLoginAt), { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</TD>
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

export function AdminUserDetail({ userId }: { userId: string }) {
  const t = useTranslations('admin.users');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const key = ['admin', 'user', userId];
  const user = useQuery({ queryKey: key, queryFn: () => api.admin.users.get(userId) });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['admin'] }); };
  const run = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: async () => { await refresh(); toast(t('updated')); }, onError: (e) => toast(errorMessage(e), 'error') });

  if (user.isPending) return <Skeleton className="h-64" />;
  if (user.isError) return <ErrorAlert error={user.error} />;
  const u = user.data;
  const isStaff = u.platformRoles.length > 0;
  return (
    <>
      <Link href="/admin/users" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t('back')}</Link>
      <PageHeader title={u.fullName} description={u.email} actions={<StatusBadge status={u.status} />} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="anim-rise">
          <CardHeader><CardTitle>{t('account')}</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('verified')}</dt><dd>{u.emailVerifiedAt ? t('yes') : t('no')}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('mfa')}</dt><dd>{u.mfaEnabled ? t('on') : t('off')}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('lastLogin')}</dt><dd>{u.lastLoginAt ? format.dateTime(new Date(u.lastLoginAt), { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('created')}</dt><dd>{format.dateTime(new Date(u.createdAt), { dateStyle: 'medium' })}</dd></div>
              {isStaff && <div className="flex justify-between gap-4"><dt className="text-muted">{t('platformRole')}</dt><dd><Badge tone="accent">{u.platformRoles.join(', ')}</Badge></dd></div>}
            </dl>
            {u.id !== me?.id && (
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                {u.status === 'ACTIVE'
                  ? <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} disabled={isStaff} onConfirm={() => run.mutateAsync(() => api.admin.users.suspend(u.id))}>{t('suspend')}</ConfirmButton>
                  : <Button size="sm" variant="secondary" onClick={() => run.mutate(() => api.admin.users.activate(u.id))}>{t('activate')}</Button>}
                {u.status === 'ACTIVE' && !isStaff && (
                  <ConfirmButton size="sm" variant="secondary" confirmLabel={t('confirmAgain')} onConfirm={() => run.mutateAsync(() => api.admin.platformRoles.grant(u.id))}>{t('makeAdmin')}</ConfirmButton>
                )}
                {isStaff && <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => run.mutateAsync(() => api.admin.platformRoles.revoke(u.id))}>{t('revokeAdmin')}</ConfirmButton>}
              </div>
            )}
            {isStaff && u.status === 'ACTIVE' && <p className="text-xs text-muted">{t('staffHint')}</p>}
          </CardBody>
        </Card>
        <Card className="anim-rise" style={{ ['--i' as string]: 1 }}>
          <CardHeader><CardTitle>{t('memberships')}</CardTitle></CardHeader>
          <CardBody className="p-0">
            {u.memberships.length === 0 && <p className="p-5 text-sm text-muted">{t('noMemberships')}</p>}
            <ul className="divide-y divide-line">
              {u.memberships.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <Link href={`/admin/organizations/${m.organization.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-link">{m.organization.name}</Link>
                  <span className="text-sm text-muted">{m.role.key}</span>
                  <StatusBadge status={m.status} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
