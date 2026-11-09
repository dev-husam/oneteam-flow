'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, Send } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { applyFieldErrors } from '@/features/auth/forms';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg, useRoleLabel } from '@/lib/org/org-context';
import { useCursorList } from '@/lib/use-cursor-list';

const schema = z.object({
  email: z.string().trim().min(1, 'required').pipe(z.email('email')),
  fullName: z.string().trim().max(120, 'maxLength'),
  roleId: z.string().min(1, 'required'),
  assignTo: z.string(),
});
type Values = z.infer<typeof schema>;

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('invitations');
  const tv = useTranslations('validation');
  const roleLabel = useRoleLabel();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId, can, scopeOf, rank } = useOrg();
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);

  const roles = useQuery({ queryKey: orgKey(orgId, 'assignable-roles'), queryFn: () => api.org(orgId).roles.assignable() });
  const canAssign = can('assignment.manage');
  const members = useQuery({ queryKey: orgKey(orgId, 'members', 'candidates'), queryFn: () => api.org(orgId).members.list({ status: 'ACTIVE', limit: 100 }), enabled: canAssign });
  const groups = useQuery({ queryKey: orgKey(orgId, 'groups', 'all'), queryFn: () => api.org(orgId).groups.list({ limit: 100 }), enabled: can('group.read') });

  const { register, handleSubmit, setError: setFieldError, control, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', fullName: '', roleId: '', assignTo: '' },
  });
  const chosenId = useWatch({ control, name: 'roleId' });
  const chosen = roles.data?.find((r) => r.id === chosenId);
  const assignees = (members.data?.data ?? []).filter((m) => (chosen ? m.role.rank > chosen.rank : true));
  // Members whose reach is limited to their own participants are assigned automatically by the server.
  const autoAssigned = scopeOf('member.read') === 'ASSIGNED' && chosen && chosen.rank < rank;

  const invite = useMutation({
    mutationFn: (v: Values) =>
      api.org(orgId).invitations.create({ email: v.email, roleId: v.roleId, fullName: v.fullName || undefined, assignToMembershipId: v.assignTo || undefined, groupIds: groupIds.length ? groupIds : undefined }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'invitations') });
      toast(t('sent'));
      onClose();
    },
    onError: (err, v) => {
      if (!applyFieldErrors(err, setFieldError, ['email', 'fullName'])) setError(err);
      void v;
    },
  });
  const fieldError = (key?: string) => (key ? tv(key as 'required') : undefined);

  return (
    <Dialog open={open} onClose={onClose} title={t('inviteTitle')} description={t('inviteBody')}>
      <form onSubmit={handleSubmit((v) => { setError(null); invite.mutate(v); })} noValidate className="space-y-4">
        {error !== null && <ErrorAlert error={error} />}
        {roles.isError && <ErrorAlert error={roles.error} />}
        <Field label={t('email')} error={fieldError(errors.email?.message)}>
          {(c) => <Input {...c} type="email" dir="ltr" className="text-start" autoFocus {...register('email')} />}
        </Field>
        <Field label={t('fullName')} optionalLabel={t('optional')} error={fieldError(errors.fullName?.message)}>
          {(c) => <Input {...c} {...register('fullName')} />}
        </Field>
        <Field label={t('role')} hint={t('roleHint')} error={fieldError(errors.roleId?.message)}>
          {(c) => (
            <Select {...c} disabled={roles.isPending} {...register('roleId')}>
              <option value="">{t('chooseRole')}</option>
              {roles.data?.map((r) => <option key={r.id} value={r.id}>{roleLabel(r)}</option>)}
            </Select>
          )}
        </Field>
        {canAssign && (
          <Field label={t('assignTo')} optionalLabel={t('optional')} hint={t('assignToHint')}>
            {(c) => (
              <Select {...c} disabled={members.isPending} {...register('assignTo')}>
                <option value="">{t('noAssignee')}</option>
                {assignees.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
              </Select>
            )}
          </Field>
        )}
        {!canAssign && autoAssigned && <Alert tone="info">{t('autoAssigned')}</Alert>}
        {groups.data && groups.data.data.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink-2">{t('groups')} <span className="text-xs font-normal text-muted">{t('optional')}</span></legend>
            <div className="flex flex-wrap gap-2">
              {groups.data.data.map((g) => {
                const on = groupIds.includes(g.id);
                return (
                  <label key={g.id} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${on ? 'border-selection-line bg-selection text-selection-fg' : 'border-line text-ink-2 hover:border-selection-line'}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => setGroupIds((cur) => (on ? cur.filter((x) => x !== g.id) : [...cur, g.id]))} />
                    {g.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <Button type="submit" loading={invite.isPending} className="w-full">
          <Send className="size-4 rtl:-scale-x-100" aria-hidden /> {t('send')}
        </Button>
      </form>
    </Dialog>
  );
}

const FILTERS = ['', 'PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] as const;

export function InvitationsPage() {
  const t = useTranslations('invitations');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, can } = useOrg();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('');
  const [inviting, setInviting] = useState(false);
  const list = useCursorList(orgKey(orgId, 'invitations', status), (cursor) => api.org(orgId).invitations.list({ status: status || undefined, cursor, limit: 25 }));
  const roles = useQuery({ queryKey: orgKey(orgId, 'assignable-roles'), queryFn: () => api.org(orgId).roles.assignable(), staleTime: 60_000 });
  const roleLabel = useRoleLabel();
  const roleName = (id: string) => { const r = roles.data?.find((x) => x.id === id); return r ? roleLabel(r) : '—'; };

  const refresh = () => queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'invitations') });
  const resend = useMutation({ mutationFn: (id: string) => api.org(orgId).invitations.resend(id), onSuccess: async () => { toast(t('resent')); await refresh(); }, onError: (e) => toast(errorMessage(e), 'error') });
  const revoke = useMutation({ mutationFn: (id: string) => api.org(orgId).invitations.revoke(id), onSuccess: async () => { toast(t('revoked')); await refresh(); }, onError: (e) => toast(errorMessage(e), 'error') });

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={can('member.invite') && <Button onClick={() => setInviting(true)}><MailPlus className="size-4" aria-hidden /> {t('invite')}</Button>} />
      <Card className="anim-rise">
        <div className="flex flex-wrap gap-2 border-b border-line p-4" role="tablist" aria-label={t('filter')}>
          {FILTERS.map((f) => (
            <button key={f || 'all'} role="tab" aria-selected={status === f} type="button" onClick={() => setStatus(f)}
              className={`rounded-full px-3 py-1 text-sm ${status === f ? 'bg-selection font-medium text-link' : 'text-muted hover:text-ink'}`}>
              {f ? t(`filterOption.${f}`) : t('filterOption.all')}
            </button>
          ))}
        </div>
        {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-11" /><Skeleton className="h-11" /></div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        {!list.isPending && !list.isError && list.items.length === 0 && <EmptyState icon={MailPlus} title={t('empty')}>{t('emptyBody')}</EmptyState>}
        {list.items.length > 0 && (
          <Table>
            <THead><tr><TH>{t('email')}</TH><TH>{t('role')}</TH><TH>{t('status')}</TH><TH>{t('expires')}</TH><TH className="text-end"><span className="sr-only">{t('actions')}</span></TH></tr></THead>
            <TBody>
              {list.items.map((i) => (
                <TR key={i.id}>
                  <TD className="ltr-isolate font-medium">{i.email}</TD>
                  <TD>{roleName(i.roleId)}</TD>
                  <TD><StatusBadge status={i.status} /></TD>
                  <TD className="text-muted">{format.dateTime(new Date(i.expiresAt), { dateStyle: 'medium' })}</TD>
                  <TD className="text-end">
                    {(i.status === 'PENDING' || i.status === 'EXPIRED') && can('invitation.manage') && (
                      <span className="inline-flex gap-1.5">
                        <Button size="sm" variant="secondary" loading={resend.isPending && resend.variables === i.id} onClick={() => resend.mutate(i.id)}>{t('resend')}</Button>
                        {i.status === 'PENDING' && <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => revoke.mutateAsync(i.id)}>{t('revoke')}</ConfirmButton>}
                      </span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <LoadMore hasNextPage={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
      </Card>
      {inviting && <InviteDialog open onClose={() => setInviting(false)} />}
    </>
  );
}
