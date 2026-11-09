'use client';

import { MoreHorizontal, Users } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { orgKey, useOrg, useRoleLabel } from '@/lib/org/org-context';
import { useCursorList } from '@/lib/use-cursor-list';
import { useDebounced } from '@/lib/use-debounced';
import { useQuery } from '@tanstack/react-query';

const STATUSES = ['ACTIVE', 'SUSPENDED', 'REMOVED'] as const;

export function MembersPage() {
  const t = useTranslations('members');
  const format = useFormatter();
  const roleLabel = useRoleLabel();
  const { orgId, slug, can, membershipId } = useOrg();
  const [q, setQ] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number] | ''>('');
  const search = useDebounced(q.trim());

  const roles = useQuery({ queryKey: orgKey(orgId, 'assignable-roles'), queryFn: () => api.org(orgId).roles.assignable(), staleTime: 60_000 });
  const list = useCursorList(orgKey(orgId, 'members', search, roleId, status), (cursor) =>
    api.org(orgId).members.list({ q: search || undefined, roleId: roleId || undefined, status: status || undefined, cursor, limit: 25 }),
  );
  const filtered = Boolean(search || roleId || status);

  return (
    <>
      <PageHeader
        title={t('title')}
        description={can('member.read') ? t('subtitle') : undefined}
        actions={can('member.invite') && <Link href={`/o/${slug}/invitations`} className={buttonVariants()}>{t('invite')}</Link>}
      />
      <Card className="anim-rise">
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('search')} className="w-full sm:max-w-xs" />
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label={t('filterRole')} className="w-full sm:w-48">
            <option value="">{t('allRoles')}</option>
            {roles.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={t('filterStatus')} className="w-full sm:w-44">
            <option value="">{t('activeAndSuspended')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statusOption.${s}`)}
              </option>
            ))}
          </Select>
        </div>

        {list.isPending && <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11" />)}</div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        {!list.isPending && !list.isError && list.items.length === 0 && (
          <EmptyState icon={Users} title={filtered ? t('noResults') : t('empty')}>
            {filtered ? t('noResultsBody') : t('emptyBody')}
          </EmptyState>
        )}
        {list.items.length > 0 && (
          <Table>
            <THead>
              <tr>
                <TH>{t('name')}</TH>
                <TH>{t('role')}</TH>
                <TH>{t('status')}</TH>
                <TH>{t('joined')}</TH>
                <TH className="w-12"><span className="sr-only">{t('actions')}</span></TH>
              </tr>
            </THead>
            <TBody>
              {list.items.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <Link href={`/o/${slug}/members/${m.id}`} className="font-medium hover:text-link">
                      {m.fullName}
                      {m.id === membershipId && <span className="ms-2 text-xs font-normal text-muted">({t('you')})</span>}
                    </Link>
                    <p className="ltr-isolate text-xs text-muted">{m.email}</p>
                  </TD>
                  <TD>{roleLabel(m.role)}</TD>
                  <TD><StatusBadge status={m.status} /></TD>
                  <TD className="text-muted">{format.dateTime(new Date(m.joinedAt), { dateStyle: 'medium' })}</TD>
                  <TD>
                    <Link href={`/o/${slug}/members/${m.id}`} aria-label={t('open', { name: m.fullName })} className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink">
                      <MoreHorizontal className="size-4" aria-hidden />
                    </Link>
                  </TD>
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
