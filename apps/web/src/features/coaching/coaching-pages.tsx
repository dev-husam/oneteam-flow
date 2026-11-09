'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CoachNote, NoteVisibility } from '@pt/api-client';
import { ASSESSMENT_LIMITS, SESSION_LIMITS } from '@pt/domain';
import { ArrowLeft, CalendarPlus, Lock, Share2, Users } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { useOrg } from '@/lib/org/org-context';
import { AnswersView, AssessmentDialog, coachingKey, ResourceDialog, ResourceItem, SessionDialog, SessionRow, TrendCharts, useClientsOptions } from './shared';

const soon = (s: { startsAt: string; status: string }) => s.status === 'PLANNED';

// ------------------------------------------------------------------------------------------ coach home

export function CoachingHome() {
  const t = useTranslations('coaching');
  const format = useFormatter();
  const { orgId, slug } = useOrg();
  const [scheduling, setScheduling] = useState(false);
  const { clients, loading, error } = useClientsOptions();
  const sessions = useQuery({ queryKey: coachingKey(orgId, 'sessions', 'planned'), queryFn: () => api.org(orgId).coaching.sessions.list({ status: 'PLANNED', order: 'asc' }) });
  const next = new Map<string, string>();
  for (const s of sessions.data ?? []) if (soon(s) && !next.has(s.clientMembershipId)) next.set(s.clientMembershipId, s.startsAt);

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<Button onClick={() => setScheduling(true)} disabled={clients.length === 0}><CalendarPlus className="size-4" aria-hidden /> {t('schedule')}</Button>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="anim-rise">
          <CardHeader><CardTitle>{t('upcoming')}</CardTitle></CardHeader>
          <CardBody className="p-0">
            {sessions.isPending && <div className="p-4"><Skeleton className="h-20" /></div>}
            {sessions.isError && <div className="p-4"><ErrorAlert error={sessions.error} /></div>}
            {sessions.data?.length === 0 && <p className="p-5 text-sm text-muted">{t('noUpcoming')}</p>}
            <ul className="divide-y divide-line">{sessions.data?.map((s) => <SessionRow key={s.id} session={s} manage />)}</ul>
          </CardBody>
        </Card>
        <Card className="anim-rise" style={{ ['--i' as string]: 1 }}>
          <CardHeader><CardTitle>{t('myClients')}</CardTitle></CardHeader>
          <CardBody className="p-0">
            {loading && <div className="p-4"><Skeleton className="h-20" /></div>}
            {error && <div className="p-4"><ErrorAlert error={error} /></div>}
            {!loading && !error && clients.length === 0 && <EmptyState icon={Users} title={t('noClients')}>{t('noClientsBody')}</EmptyState>}
            <ul className="divide-y divide-line">
              {clients.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted">{t('nextSession')}: {next.has(c.id) ? format.dateTime(new Date(next.get(c.id)!), { dateStyle: 'medium', timeStyle: 'short' }) : t('none')}</p>
                  </div>
                  <Link href={`/o/${slug}/coaching/clients/${c.id}`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>{t('open')}</Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
      {scheduling && <SessionDialog open onClose={() => setScheduling(false)} clients={clients} />}
    </>
  );
}

// ------------------------------------------------------------------------------------------ one client

function NotesPanel({ clientId }: { clientId: string }) {
  const t = useTranslations('coaching.notes');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, can } = useOrg();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<NoteVisibility>('SHARED');
  const notes = useQuery({ queryKey: coachingKey(orgId, 'notes', clientId), queryFn: () => api.org(orgId).coaching.notes.list(clientId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: coachingKey(orgId, 'notes') });
  const add = useMutation({
    mutationFn: () => api.org(orgId).coaching.notes.create({ clientMembershipId: clientId, visibility, body }),
    onSuccess: async () => { setBody(''); await refresh(); toast(t('toastAdded')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const change = useMutation({ mutationFn: (v: { id: string; visibility: NoteVisibility }) => api.org(orgId).coaching.notes.update(v.id, { visibility: v.visibility }), onSuccess: refresh, onError: (e) => toast(errorMessage(e), 'error') });
  const remove = useMutation({ mutationFn: (id: string) => api.org(orgId).coaching.notes.remove(id), onSuccess: refresh, onError: (e) => toast(errorMessage(e), 'error') });

  return (
    <Card className="anim-rise">
      <CardHeader><CardTitle>{t('title')}</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {can('coaching.note.write') && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
            <Field label={t('add')}>{(c) => <Textarea {...c} dir="auto" rows={3} maxLength={SESSION_LIMITS.note} placeholder={t('placeholder')} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
            <Field label={t('visibility')} hint={visibility === 'PRIVATE' ? t('privateHint') : t('sharedHint')}>
              {(c) => <Select {...c} value={visibility} onChange={(e) => setVisibility(e.target.value as NoteVisibility)}><option value="SHARED">{t('shared')}</option><option value="PRIVATE">{t('private')}</option></Select>}
            </Field>
            <Button type="submit" loading={add.isPending} disabled={!body.trim()}>{t('add')}</Button>
          </form>
        )}
        {notes.isPending && <Skeleton className="h-16" />}
        {notes.isError && <ErrorAlert error={notes.error} />}
        {notes.data?.length === 0 && <p className="text-sm text-muted">{t('none')}</p>}
        <ul className="space-y-3">
          {notes.data?.map((n: CoachNote) => (
            <li key={n.id} className="rounded-md border border-line p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge tone={n.visibility === 'PRIVATE' ? 'warn' : 'accent'}>{n.visibility === 'PRIVATE' ? <><Lock className="size-3" aria-hidden /> {t('private')}</> : t('shared')}</Badge>
                <span>{format.dateTime(new Date(n.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {!n.mine && <span>· {t('by', { name: n.authorName })}</span>}
                {!n.mine && n.visibility === 'PRIVATE' && <span>· {t('others')}</span>}
              </div>
              <p className="whitespace-pre-line text-sm" dir="auto">{n.body}</p>
              {n.mine && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => change.mutate({ id: n.id, visibility: n.visibility === 'PRIVATE' ? 'SHARED' : 'PRIVATE' })}>{n.visibility === 'PRIVATE' ? <><Share2 className="size-4" aria-hidden /> {t('makeShared')}</> : t('makePrivate')}</Button>
                  <ConfirmButton size="sm" confirmLabel={t('deleteConfirm')} onConfirm={() => remove.mutate(n.id)}>{t('delete')}</ConfirmButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function RequestAssessmentDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const t = useTranslations('coaching.assessments');
  const tc = useTranslations('coaching');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [templateId, setTemplateId] = useState('');
  const [cadence, setCadence] = useState('');
  const templates = useQuery({ queryKey: coachingKey(orgId, 'templates'), queryFn: () => api.org(orgId).coaching.templates.list() });
  const request = useMutation({
    mutationFn: () => api.org(orgId).coaching.assessments.request({ templateId, clientMembershipId: clientId, cadenceDays: cadence ? Number(cadence) : undefined }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: coachingKey(orgId) }); toast(t('toastRequested')); onClose(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Dialog open onClose={onClose} title={t('requestTitle')}>
      <div className="space-y-4">
        <Field label={t('template')}>{(c) => <Select {...c} value={templateId} onChange={(e) => setTemplateId(e.target.value)}><option value="">{t('chooseTemplate')}</option>{templates.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
        <Field label={t('cadence')}>{(c) => <Select {...c} value={cadence} onChange={(e) => setCadence(e.target.value)}><option value="">{t('once')}</option>{[ASSESSMENT_LIMITS.minCadenceDays, 14, 30, 90].map((d) => <option key={d} value={d}>{t('every', { days: d })}</option>)}</Select>}</Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
          <Button loading={request.isPending} disabled={!templateId} onClick={() => request.mutate()}>{t('request')}</Button>
        </div>
      </div>
    </Dialog>
  );
}

function AssessmentsPanel({ clientId, coach }: { clientId: string; coach: boolean }) {
  const t = useTranslations('coaching.assessments');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, can } = useOrg();
  const [requesting, setRequesting] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const list = useQuery({ queryKey: coachingKey(orgId, 'assessments', clientId), queryFn: () => api.org(orgId).coaching.assessments.list({ clientMembershipId: clientId }) });
  const trends = useQuery({ queryKey: coachingKey(orgId, 'trends', clientId), queryFn: () => api.org(orgId).coaching.assessments.trends(clientId) });
  const cancel = useMutation({ mutationFn: (id: string) => api.org(orgId).coaching.assessments.cancel(id), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: coachingKey(orgId) }); toast(t('toastCancelled')); }, onError: (e) => toast(errorMessage(e), 'error') });
  const open = list.data?.filter((a) => a.status === 'REQUESTED') ?? [];
  const done = list.data?.filter((a) => a.status === 'COMPLETED') ?? [];
  const answeringItem = open.find((a) => a.id === answering);

  return (
    <Card className="anim-rise">
      <CardHeader className="flex-row items-center justify-between"><CardTitle>{t('title')}</CardTitle>{coach && can('coaching.assessment.manage') && <Button size="sm" variant="secondary" onClick={() => setRequesting(true)}>{t('request')}</Button>}</CardHeader>
      <CardBody className="space-y-5">
        {list.isPending && <Skeleton className="h-16" />}
        {list.isError && <ErrorAlert error={list.error} />}
        <section aria-label={t('todo')}>
          <h3 className="mb-2 text-sm font-semibold">{t('todo')}</h3>
          {open.length === 0 && <p className="text-sm text-muted">{t('noneTodo')}</p>}
          <ul className="space-y-2">
            {open.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium" dir="auto">{a.title}</p>
                  <p className="text-xs text-muted">{t('requestedBy', { name: a.requestedByName })}{a.dueAt ? ` · ${t('due', { date: format.dateTime(new Date(a.dueAt), { dateStyle: 'medium' }) })}` : ''}{a.cadenceDays ? ` · ${t('repeats', { days: a.cadenceDays })}` : ''}</p>
                </div>
                {!coach && can('coaching.assessment.submit') && <Button size="sm" onClick={() => setAnswering(a.id)}>{t('complete')}</Button>}
                {coach && <ConfirmButton size="sm" confirmLabel={t('stopRepeating')} onConfirm={() => cancel.mutate(a.id)}>{t('stopRepeating')}</ConfirmButton>}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label={t('trends')}>
          <h3 className="mb-2 text-sm font-semibold">{t('trends')}</h3>
          {trends.data && <TrendCharts series={trends.data} />}
        </section>
        <section aria-label={t('history')}>
          <h3 className="mb-2 text-sm font-semibold">{t('history')}</h3>
          {done.length === 0 && <p className="text-sm text-muted">{t('noneHistory')}</p>}
          <ul className="space-y-3">
            {done.map((a) => (
              <li key={a.id} className="rounded-md border border-line p-3">
                <p className="mb-1 text-sm font-medium" dir="auto">{a.title} <span className="font-normal text-muted">· {t('completedOn', { date: format.dateTime(new Date(a.completedAt!), { dateStyle: 'medium' }) })}</span></p>
                <AnswersView assessment={a} />
              </li>
            ))}
          </ul>
        </section>
      </CardBody>
      {requesting && <RequestAssessmentDialog clientId={clientId} onClose={() => setRequesting(false)} />}
      {answeringItem && <AssessmentDialog assessment={answeringItem} onClose={() => setAnswering(null)} />}
    </Card>
  );
}

function ClientResources({ clientId, coach }: { clientId: string; coach: boolean }) {
  const t = useTranslations('coaching.resources');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, can } = useOrg();
  const [sharing, setSharing] = useState(false);
  const list = useQuery({ queryKey: coachingKey(orgId, 'resources', clientId), queryFn: () => api.org(orgId).coaching.resources.list(coach ? clientId : undefined) });
  const archive = useMutation({ mutationFn: (id: string) => api.org(orgId).coaching.resources.archive(id), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: coachingKey(orgId) }); toast(t('toastArchived')); }, onError: (e) => toast(errorMessage(e), 'error') });
  return (
    <Card className="anim-rise">
      <CardHeader className="flex-row items-center justify-between"><CardTitle>{t('title')}</CardTitle>{coach && can('coaching.resource.manage') && <Button size="sm" variant="secondary" onClick={() => setSharing(true)}>{t('new')}</Button>}</CardHeader>
      <CardBody className="p-0">
        {list.isPending && <div className="p-4"><Skeleton className="h-12" /></div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        {list.data?.length === 0 && <p className="p-5 text-sm text-muted">{coach ? t('empty') : t('emptyMine')}</p>}
        <ul className="divide-y divide-line">{list.data?.map((r) => <ResourceItem key={r.id} resource={r} onArchive={coach ? () => archive.mutate(r.id) : undefined} />)}</ul>
      </CardBody>
      {sharing && <ResourceDialog open onClose={() => setSharing(false)} clientId={clientId} />}
    </Card>
  );
}

export function ClientWorkspace({ membershipId }: { membershipId: string }) {
  const t = useTranslations('coaching');
  const { orgId, slug } = useOrg();
  const [scheduling, setScheduling] = useState(false);
  const member = useQuery({ queryKey: coachingKey(orgId, 'member', membershipId), queryFn: () => api.org(orgId).members.get(membershipId) });
  const sessions = useQuery({ queryKey: coachingKey(orgId, 'sessions', membershipId), queryFn: () => api.org(orgId).coaching.sessions.list({ clientMembershipId: membershipId, order: 'desc' }) });
  if (member.isError) return <ErrorAlert error={member.error} />;
  return (
    <>
      <Link href={`/o/${slug}/coaching`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t('back')}</Link>
      <PageHeader title={member.data?.fullName ?? ''} actions={<Button onClick={() => setScheduling(true)}><CalendarPlus className="size-4" aria-hidden /> {t('schedule')}</Button>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card className="anim-rise">
            <CardHeader><CardTitle>{t('sessions.title')}</CardTitle></CardHeader>
            <CardBody className="p-0">
              {sessions.isPending && <div className="p-4"><Skeleton className="h-16" /></div>}
              {sessions.isError && <div className="p-4"><ErrorAlert error={sessions.error} /></div>}
              {sessions.data?.length === 0 && <p className="p-5 text-sm text-muted">{t('sessions.none')}</p>}
              <ul className="divide-y divide-line">{sessions.data?.map((s) => <SessionRow key={s.id} session={s} manage />)}</ul>
            </CardBody>
          </Card>
          <ClientResources clientId={membershipId} coach />
        </div>
        <div className="space-y-5">
          <NotesPanel clientId={membershipId} />
          <AssessmentsPanel clientId={membershipId} coach />
        </div>
      </div>
      {scheduling && <SessionDialog open onClose={() => setScheduling(false)} clientId={membershipId} />}
    </>
  );
}

// ------------------------------------------------------------------------------------------ the client’s own page

export function MyCoaching() {
  const t = useTranslations('coaching');
  const { orgId, context } = useOrg();
  const me = context.membership.id;
  const sessions = useQuery({ queryKey: coachingKey(orgId, 'sessions', 'mine'), queryFn: () => api.org(orgId).coaching.sessions.list({ order: 'asc' }) });
  const notes = useQuery({ queryKey: coachingKey(orgId, 'notes', me), queryFn: () => api.org(orgId).coaching.notes.list(me) });
  const format = useFormatter();
  const upcoming = sessions.data?.filter((s) => s.status === 'PLANNED') ?? [];
  const earlier = (sessions.data?.filter((s) => s.status !== 'PLANNED') ?? []).reverse();
  return (
    <>
      <PageHeader title={t('mine.title')} description={t('mine.subtitle')} />
      {sessions.isError && <ErrorAlert error={sessions.error} />}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card className="anim-rise">
            <CardHeader><CardTitle>{t('upcoming')}</CardTitle></CardHeader>
            <CardBody className="p-0">
              {sessions.isPending && <div className="p-4"><Skeleton className="h-16" /></div>}
              {sessions.data && upcoming.length === 0 && <p className="p-5 text-sm text-muted">{sessions.data.length === 0 ? t('mine.noCoach') : t('noUpcoming')}</p>}
              <ul className="divide-y divide-line">{upcoming.map((s) => <SessionRow key={s.id} session={s} manage={false} />)}</ul>
              {earlier.length > 0 && <p className="border-t border-line px-5 py-2 text-xs font-medium uppercase tracking-wide text-muted">{t('sessions.past')}</p>}
              <ul className="divide-y divide-line">{earlier.map((s) => <SessionRow key={s.id} session={s} manage={false} />)}</ul>
            </CardBody>
          </Card>
          <ClientResources clientId={me} coach={false} />
        </div>
        <div className="space-y-5">
          <AssessmentsPanel clientId={me} coach={false} />
          <Card className="anim-rise">
            <CardHeader><CardTitle>{t('mine.notes')}</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              {notes.data?.length === 0 && <p className="text-sm text-muted">{t('notes.none')}</p>}
              {notes.data?.map((n) => (
                <div key={n.id} className="rounded-md border border-line p-3">
                  <p className="mb-1 text-xs text-muted">{n.authorName} · {format.dateTime(new Date(n.createdAt), { dateStyle: 'medium' })}</p>
                  <p className="whitespace-pre-line text-sm" dir="auto">{n.body}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
