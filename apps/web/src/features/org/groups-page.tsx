'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@pt/api-client';
import { ArrowLeft, UserMinus, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { useCursorList } from '@/lib/use-cursor-list';

function GroupFormDialog({ open, onClose, group }: { open: boolean; onClose: () => void; group?: { id: string; name: string; description: string | null } }) {
  const t = useTranslations('groups');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || undefined };
      return group ? api.org(orgId).groups.update(group.id, body) : api.org(orgId).groups.create(body);
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'groups') }); toast(t('saved')); onClose(); },
  });
  return (
    <Dialog open={open} onClose={onClose} title={group ? t('editTitle') : t('createTitle')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        {save.isError && <ErrorAlert error={save.error} />}
        <Field label={t('name')}>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} />}</Field>
        <Field label={t('description')} optionalLabel={t('optional')}>{(c) => <Input {...c} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />}</Field>
        <Button type="submit" loading={save.isPending} disabled={name.trim().length < 2} className="w-full">{t('save')}</Button>
      </form>
    </Dialog>
  );
}

export function GroupsPage() {
  const t = useTranslations('groups');
  const { orgId, slug, can } = useOrg();
  const [creating, setCreating] = useState(false);
  const list = useCursorList(orgKey(orgId, 'groups', 'list'), (cursor) => api.org(orgId).groups.list({ cursor, limit: 25 }));
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={can('group.manage') && <Button onClick={() => setCreating(true)}>{t('create')}</Button>} />
      <Card className="anim-rise">
        {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        {!list.isPending && !list.isError && list.items.length === 0 && <EmptyState icon={UsersRound} title={t('empty')}>{t('emptyBody')}</EmptyState>}
        {list.items.length > 0 && (
          <ul className="divide-y divide-line">
            {list.items.map((g) => (
              <li key={g.id}>
                <Link href={`/o/${slug}/groups/${g.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2">
                  <span className="grid size-10 place-items-center rounded-md bg-selection text-link"><UsersRound className="size-5" aria-hidden /></span>
                  <span className="min-w-0 flex-1"><span className="block font-medium">{g.name}</span>{g.description && <span className="block truncate text-sm text-muted">{g.description}</span>}</span>
                  <Badge>{t('memberCount', { count: g.memberCount })}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <LoadMore hasNextPage={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
      </Card>
      {creating && <GroupFormDialog open onClose={() => setCreating(false)} />}
    </>
  );
}

export function GroupDetail({ groupId }: { groupId: string }) {
  const t = useTranslations('groups');
  const toast = useToast();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, slug, can } = useOrg();
  const [editing, setEditing] = useState(false);
  const [toAdd, setToAdd] = useState('');
  const key = orgKey(orgId, 'groups', groupId);
  const group = useQuery({ queryKey: key, queryFn: () => api.org(orgId).groups.get(groupId), retry: (c, e) => c < 2 && !(e instanceof ApiError && e.status < 500) });
  const candidates = useQuery({ queryKey: orgKey(orgId, 'members', 'candidates'), queryFn: () => api.org(orgId).members.list({ status: 'ACTIVE', limit: 100 }), enabled: can('group.manage') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'groups') });
  const fail = (e: unknown) => toast(errorMessage(e), 'error');
  const add = useMutation({ mutationFn: () => api.org(orgId).groups.addMember(groupId, toAdd), onSuccess: async () => { setToAdd(''); await refresh(); }, onError: fail });
  const remove = useMutation({ mutationFn: (id: string) => api.org(orgId).groups.removeMember(groupId, id), onSuccess: refresh, onError: fail });
  const archive = useMutation({ mutationFn: () => api.org(orgId).groups.archive(groupId), onSuccess: async () => { await refresh(); toast(t('archived')); router.replace(`/o/${slug}/groups`); }, onError: fail });

  if (group.isPending) return <Skeleton className="h-64" />;
  if (group.isError) return <div className="space-y-4"><ErrorAlert error={group.error} /><Link href={`/o/${slug}/groups`} className="text-sm font-medium text-link hover:underline">{t('back')}</Link></div>;
  const g = group.data;
  const inGroup = new Set(g.members.map((m) => m.membershipId));
  const options = candidates.data?.data.filter((m) => !inGroup.has(m.id)) ?? [];

  return (
    <>
      <Link href={`/o/${slug}/groups`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t('back')}</Link>
      <PageHeader title={g.name} description={g.description ?? undefined} actions={can('group.manage') && (<><Button variant="secondary" size="sm" onClick={() => setEditing(true)}>{t('edit')}</Button><ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => archive.mutateAsync()}>{t('archive')}</ConfirmButton></>)} />
      <Card className="anim-rise">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>{t('members')} <Badge className="ms-2">{g.members.length}</Badge></CardTitle>
          {can('group.manage') && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (toAdd) add.mutate(); }}>
              <Select value={toAdd} onChange={(e) => setToAdd(e.target.value)} aria-label={t('addMember')} className="h-9 w-52" disabled={candidates.isPending}>
                <option value="">{t('addMember')}</option>
                {options.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
              </Select>
              <Button type="submit" size="sm" loading={add.isPending} disabled={!toAdd}>{t('add')}</Button>
            </form>
          )}
        </CardHeader>
        <CardBody className="p-0">
          {g.members.length === 0 && <EmptyState icon={UsersRound} title={t('noMembers')} />}
          <ul className="divide-y divide-line">
            {g.members.map((m) => (
              <li key={m.membershipId} className="flex items-center gap-3 px-5 py-3">
                <Link href={`/o/${slug}/members/${m.membershipId}`} className="min-w-0 flex-1 truncate font-medium hover:text-link">{m.fullName}</Link>
                {can('group.manage') && <Button variant="ghost" size="icon" aria-label={t('removeMember', { name: m.fullName })} onClick={() => remove.mutate(m.membershipId)}><UserMinus className="size-4" aria-hidden /></Button>}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      {editing && <GroupFormDialog open onClose={() => setEditing(false)} group={g} />}
    </>
  );
}
