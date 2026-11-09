'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoleDetail } from '@pt/api-client';
import { canManageRank } from '@pt/domain';
import { ChevronDown, Lock, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg, useRoleLabel } from '@/lib/org/org-context';
import { grantsAbove, grantsToState, groupPermissions, selectableScopes, stateToGrants, type GrantChoice, type GrantState } from './role-grants';

function RoleFormDialog({ role, roles, onClose }: { role?: RoleDetail; roles: RoleDetail[]; onClose: () => void }) {
  const t = useTranslations('roles');
  const tp = useTranslations('permissions');
  const toast = useToast();
  const queryClient = useQueryClient();
  const label = useRoleLabel();
  const { orgId, rank, context } = useOrg();
  const mine = Object.fromEntries(context.permissions.map((p) => [p.code, p.scope]));
  const [name, setName] = useState(role?.name ?? '');
  const [roleRank, setRoleRank] = useState(String(role?.rank ?? Math.min(rank - 1, 30)));
  const [state, setState] = useState<GrantState>(role ? grantsToState(role.grants) : {});
  const catalog = useQuery({ queryKey: orgKey(orgId, 'permissions'), queryFn: () => api.org(orgId).roles.permissions(), staleTime: 5 * 60_000 });

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), rank: Number(roleRank), grants: stateToGrants(state) };
      return role ? api.org(orgId).roles.update(role.id, body) : api.org(orgId).roles.create(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'roles') });
      await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'assignable-roles') });
      await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'context') });
      toast(t('saved'));
      onClose();
    },
  });

  const copyFrom = (id: string) => {
    const source = roles.find((r) => r.id === id);
    if (!source) return;
    // Cloning keeps only what the caller may hand out, so the form never starts in a rejected state.
    const next = grantsToState(source.grants);
    for (const code of grantsAbove(next, mine)) delete next[code];
    setState(next);
  };
  const rankNumber = Number(roleRank);
  const rankOk = Number.isInteger(rankNumber) && rankNumber >= 1 && rankNumber < rank;

  return (
    <Dialog open onClose={onClose} wide title={role ? t('editTitle') : t('createTitle')} description={t('formBody')}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        {save.isError && <ErrorAlert error={save.error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('name')}>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />}</Field>
          <Field label={t('rank')} hint={t('rankHint', { max: rank - 1 })} error={rankOk ? undefined : t('rankInvalid', { max: rank - 1 })}>
            {(c) => <Input {...c} type="number" min={1} max={rank - 1} value={roleRank} onChange={(e) => setRoleRank(e.target.value)} dir="ltr" className="text-start" />}
          </Field>
        </div>
        {!role && (
          <Field label={t('copyFrom')} optionalLabel={t('optional')}>
            {(c) => (
              <Select {...c} defaultValue="" onChange={(e) => copyFrom(e.target.value)}>
                <option value="">{t('startEmpty')}</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{label({ key: r.key, name: r.name, labelKey: r.isSystem ? `role.${r.key}.default` : null })}</option>)}
              </Select>
            )}
          </Field>
        )}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">{t('permissions')}</h3>
          {catalog.isPending && <Skeleton className="h-40" />}
          {catalog.isError && <ErrorAlert error={catalog.error} />}
          {catalog.data && groupPermissions(catalog.data).map(([group, defs]) => (
            <fieldset key={group} className="rounded-md border border-line">
              <legend className="ms-3 px-2 text-xs font-semibold uppercase tracking-wide text-muted">{tp(`group.${group}` as 'group.members')}</legend>
              <ul className="divide-y divide-line">
                {defs.map((d) => {
                  const options = selectableScopes(d.allowedScopes, mine[d.code]);
                  return (
                    <li key={d.code} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{tp.has(`code.${d.code.replaceAll('.', '_')}` as 'code.audit_read') ? tp(`code.${d.code.replaceAll('.', '_')}` as 'code.audit_read') : d.description}</p>
                        <p className="ltr-isolate font-mono text-xs text-muted">{d.code}</p>
                      </div>
                      <Select aria-label={d.code} className="h-9 w-40" disabled={options.length === 0} value={state[d.code] ?? ''}
                        onChange={(e) => setState((s) => ({ ...s, [d.code]: e.target.value as GrantChoice }))}>
                        <option value="">{t('scope.none')}</option>
                        {options.map((s) => <option key={s} value={s}>{t(`scope.${s}`)}</option>)}
                      </Select>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
        </div>
        <Button type="submit" loading={save.isPending} disabled={name.trim().length < 2 || !rankOk} className="w-full">{t('save')}</Button>
      </form>
    </Dialog>
  );
}

function RoleCard({ role, onEdit }: { role: RoleDetail; onEdit: (r: RoleDetail) => void }) {
  const t = useTranslations('roles');
  const tp = useTranslations('permissions');
  const label = useRoleLabel();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, can, rank, context } = useOrg();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.org(orgId).roles.remove(role.id),
    onSuccess: async () => { toast(t('deleted')); await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'roles') }); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const editable = context.features.custom_roles && !role.isSystem && can('role.manage') && canManageRank(rank, role.rank);

  return (
    <Card className="anim-rise">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{label({ key: role.key, name: role.name, labelKey: role.isSystem ? `role.${role.key}.default` : null })}</h3>
          {role.isSystem ? <Badge><Lock className="size-3" aria-hidden /> {t('system')}</Badge> : <Badge tone="accent">{t('custom')}</Badge>}
          <span className="ms-auto text-sm text-muted">{t('rankLabel', { rank: role.rank })} · {t('members', { count: role.memberCount })}</span>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-1 text-sm font-medium text-link hover:underline">
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          {t('permissionCount', { count: role.grants.length })}
        </button>
        {open && (
          <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {role.grants.map((g) => (
              <li key={g.code} className="flex items-baseline justify-between gap-2 border-b border-line/60 pb-1">
                <span>{tp.has(`code.${g.code.replaceAll('.', '_')}` as 'code.audit_read') ? tp(`code.${g.code.replaceAll('.', '_')}` as 'code.audit_read') : g.code}</span>
                <Badge>{t(`scope.${g.scope}`)}</Badge>
              </li>
            ))}
            {role.grants.length === 0 && <li className="text-muted">{t('noPermissions')}</li>}
          </ul>
        )}
        {editable && (
          <div className="flex gap-2 border-t border-line pt-3">
            <Button variant="secondary" size="sm" onClick={() => onEdit(role)}>{t('edit')}</Button>
            <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => remove.mutateAsync()}>{t('delete')}</ConfirmButton>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function RolesPage() {
  const t = useTranslations('roles');
  const { orgId, can, context } = useOrg();
  const customRoles = context.features.custom_roles;
  const [editing, setEditing] = useState<RoleDetail | 'new' | null>(null);
  const roles = useQuery({ queryKey: orgKey(orgId, 'roles'), queryFn: () => api.org(orgId).roles.list() });
  return (
    <>
      <PageHeader title={t('title')} description={customRoles ? t('subtitle') : undefined} actions={customRoles && can('role.manage') && <Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden /> {t('create')}</Button>} />
      <Alert tone="info" className="mb-5">{customRoles ? t('escalationNote') : t('customRolesOff')}</Alert>
      {roles.isPending && <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      {roles.isError && <ErrorAlert error={roles.error} />}
      <div className="grid gap-4">
        {roles.data?.map((r) => <RoleCard key={r.id} role={r} onEdit={setEditing} />)}
      </div>
      {editing && roles.data && <RoleFormDialog role={editing === 'new' ? undefined : editing} roles={roles.data} onClose={() => setEditing(null)} />}
    </>
  );
}
