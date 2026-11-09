'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type Member } from '@pt/api-client';
import { canManageRank, OWNER_RANK } from '@pt/domain';
import { ArrowLeft, UserMinus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg, useRoleLabel } from '@/lib/org/org-context';

function ChangeRoleDialog({ member, open, onClose }: { member: Member; open: boolean; onClose: () => void }) {
  const t = useTranslations('members');
  const roleLabel = useRoleLabel();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [roleId, setRoleId] = useState(member.role.id);
  const roles = useQuery({ queryKey: orgKey(orgId, 'assignable-roles'), queryFn: () => api.org(orgId).roles.assignable() });
  const change = useMutation({
    mutationFn: () => api.org(orgId).members.changeRole(member.id, roleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKey(orgId) });
      toast(t('roleChanged'));
      onClose();
    },
  });
  return (
    <Dialog open={open} onClose={onClose} title={t('changeRole')} description={t('changeRoleBody', { name: member.fullName })}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); change.mutate(); }}>
        {change.isError && <ErrorAlert error={change.error} />}
        {roles.isError && <ErrorAlert error={roles.error} />}
        <Field label={t('role')} hint={t('roleHint')}>
          {(c) => (
            <Select {...c} value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={roles.isPending}>
              {roles.data?.map((r) => <option key={r.id} value={r.id}>{roleLabel(r)}</option>)}
            </Select>
          )}
        </Field>
        <Button type="submit" loading={change.isPending} disabled={roleId === member.role.id} className="w-full">{t('saveRole')}</Button>
      </form>
    </Dialog>
  );
}

function AssignDialog({ member, open, onClose }: { member: Member; open: boolean; onClose: () => void }) {
  const t = useTranslations('members');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [practitioner, setPractitioner] = useState('');
  const [kind, setKind] = useState<'PRIMARY' | 'SECONDARY'>('PRIMARY');
  // Candidates: active members who outrank the participant (the same rule the server applies).
  const candidates = useQuery({ queryKey: orgKey(orgId, 'members', 'candidates'), queryFn: () => api.org(orgId).members.list({ status: 'ACTIVE', limit: 100 }) });
  const options = candidates.data?.data.filter((m) => m.id !== member.id && m.role.rank > member.role.rank) ?? [];
  const create = useMutation({
    mutationFn: () => api.org(orgId).assignments.create({ practitionerMembershipId: practitioner, participantMembershipId: member.id, kind }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'assignments') });
      toast(t('assigned'));
      onClose();
    },
  });
  return (
    <Dialog open={open} onClose={onClose} title={t('assignTitle')} description={t('assignBody', { name: member.fullName })}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        {create.isError && <ErrorAlert error={create.error} />}
        <Field label={t('practitioner')}>
          {(c) => (
            <Select {...c} value={practitioner} onChange={(e) => setPractitioner(e.target.value)} disabled={candidates.isPending}>
              <option value="">{t('choose')}</option>
              {options.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t('kind')} hint={t(`kindHint.${kind}`)}>
          {(c) => (
            <Select {...c} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="PRIMARY">{t('kindOption.PRIMARY')}</option>
              <option value="SECONDARY">{t('kindOption.SECONDARY')}</option>
            </Select>
          )}
        </Field>
        <Button type="submit" loading={create.isPending} disabled={!practitioner} className="w-full">{t('assign')}</Button>
      </form>
    </Dialog>
  );
}

function Assignments({ member }: { member: Member }) {
  const t = useTranslations('members');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, can } = useOrg();
  const [assigning, setAssigning] = useState(false);
  const key = orgKey(orgId, 'assignments', member.id);
  const asParticipant = useQuery({ queryKey: [...key, 'participant'], queryFn: () => api.org(orgId).assignments.list({ participantMembershipId: member.id }), enabled: can('assignment.read') });
  const asPractitioner = useQuery({ queryKey: [...key, 'practitioner'], queryFn: () => api.org(orgId).assignments.list({ practitionerMembershipId: member.id }), enabled: can('assignment.read') });
  const end = useMutation({
    mutationFn: (id: string) => api.org(orgId).assignments.end(id),
    onSuccess: async () => { toast(t('assignmentEnded')); await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'assignments') }); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (!can('assignment.read')) return null;

  const rows = [
    ...(asParticipant.data?.data ?? []).map((a) => ({ a, other: a.practitionerName, relation: 'practitioner' as const })),
    ...(asPractitioner.data?.data ?? []).map((a) => ({ a, other: a.participantName, relation: 'participant' as const })),
  ];
  const loading = asParticipant.isPending || asPractitioner.isPending;
  return (
    <Card className="anim-rise" style={{ ['--i' as string]: 2 }}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t('assignments')}</CardTitle>
        {can('assignment.manage') && member.status === 'ACTIVE' && <Button size="sm" variant="secondary" onClick={() => setAssigning(true)}>{t('assignAction')}</Button>}
      </CardHeader>
      <CardBody className="p-0">
        {loading && <div className="p-4"><Skeleton className="h-10" /></div>}
        {!loading && rows.length === 0 && <EmptyState icon={UserMinus} title={t('noAssignments')} />}
        {rows.length > 0 && (
          <ul className="divide-y divide-line">
            {rows.map(({ a, other, relation }) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{other}</p>
                  <p className="text-sm text-muted">{t(`relation.${relation}`)} · {t(`kindOption.${a.kind}`)}</p>
                </div>
                {can('assignment.manage') && <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => end.mutateAsync(a.id)}>{t('endAssignment')}</ConfirmButton>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <AssignDialog member={member} open={assigning} onClose={() => setAssigning(false)} />
    </Card>
  );
}

export function MemberDetail({ memberId }: { memberId: string }) {
  const t = useTranslations('members');
  const format = useFormatter();
  const roleLabel = useRoleLabel();
  const toast = useToast();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, slug, can, rank, membershipId } = useOrg();
  const [changing, setChanging] = useState(false);

  const member = useQuery({
    queryKey: orgKey(orgId, 'members', memberId),
    queryFn: () => api.org(orgId).members.get(memberId),
    retry: (count, e) => count < 2 && !(e instanceof ApiError && e.status < 500),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: orgKey(orgId) });
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => { await refresh(); toast(t('updated')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (member.isPending) return <Skeleton className="h-64" />;
  if (member.isError) {
    return (
      <div className="space-y-4">
        <ErrorAlert error={member.error} />
        <Link href={`/o/${slug}/members`} className="text-sm font-medium text-link hover:underline">{t('backToList')}</Link>
      </div>
    );
  }
  const m = member.data;
  const isSelf = m.id === membershipId;
  // A hint only: the server applies the same rank rules and has the last word.
  const manageable = !isSelf && canManageRank(rank, m.role.rank) && m.status !== 'REMOVED';
  const o = api.org(orgId).members;

  return (
    <>
      <Link href={`/o/${slug}/members`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t('backToList')}
      </Link>
      <PageHeader title={m.fullName} description={m.email} actions={<StatusBadge status={m.status} />} />

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card className="anim-rise" style={{ ['--i' as string]: 1 }}>
          <CardHeader><CardTitle>{t('details')}</CardTitle></CardHeader>
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('role')}</dt><dd className="font-medium">{roleLabel(m.role)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('status')}</dt><dd><StatusBadge status={m.status} /></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('joined')}</dt><dd>{format.dateTime(new Date(m.joinedAt), { dateStyle: 'long' })}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('email')}</dt><dd className="ltr-isolate">{m.email}</dd></div>
            </dl>
            {isSelf && <Alert className="mt-4">{t('thisIsYou')}</Alert>}
            {!isSelf && !manageable && m.status !== 'REMOVED' && (can('member.update_role') || can('member.suspend') || can('member.remove')) && (
              <Alert tone="info" className="mt-4">{t('outranked')}</Alert>
            )}
            {manageable && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                {can('member.update_role') && <Button variant="secondary" size="sm" onClick={() => setChanging(true)}>{t('changeRole')}</Button>}
                {can('member.suspend') && (m.status === 'ACTIVE'
                  ? <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => act.mutateAsync(() => o.suspend(m.id))}>{t('suspend')}</ConfirmButton>
                  : <Button variant="secondary" size="sm" onClick={() => act.mutate(() => o.reactivate(m.id))}>{t('reactivate')}</Button>)}
                {can('member.remove') && (
                  <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => act.mutateAsync(() => o.remove(m.id).then(() => router.replace(`/o/${slug}/members`)))}>
                    {t('remove')}
                  </ConfirmButton>
                )}
              </div>
            )}
            {rank >= OWNER_RANK && m.role.rank >= OWNER_RANK && !isSelf && <p className="mt-3 text-xs text-muted">{t('ownerHint')}</p>}
          </CardBody>
        </Card>
        <Assignments member={m} />
      </div>
      {changing && <ChangeRoleDialog member={m} open onClose={() => setChanging(false)} />}
    </>
  );
}
