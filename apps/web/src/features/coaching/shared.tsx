'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssessmentAnswers, AssessmentQuestion, CoachAssessment, CoachResource, CoachSession, TrendSeries } from '@pt/api-client';
import { ASSESSMENT_LIMITS, questionLabel, SESSION_LIMITS } from '@pt/domain';
import { ExternalLink, FileDown, MapPin, Video } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { LineChart } from '@/components/ui/line-chart';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg } from '@/lib/org/org-context';

export const coachingKey = (orgId: string, ...rest: string[]) => orgKey(orgId, 'coaching', ...rest);

/** `<input type="datetime-local">` speaks local time without a zone; the API takes an exact instant. */
export const toLocalInput = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const defaultStart = (): string => {
  const d = new Date(Date.now() + 24 * 3_600_000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d.toISOString());
};

const isLink = (s: string | null) => Boolean(s && /^https?:\/\//i.test(s));

// ---------------------------------------------------------------------------------------------- sessions

export function SessionDialog({ open, onClose, session, clientId, clients }: { open: boolean; onClose: () => void; session?: CoachSession; clientId?: string; clients?: { id: string; name: string }[] }) {
  const t = useTranslations('coaching');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [client, setClient] = useState(clientId ?? session?.clientMembershipId ?? '');
  const [start, setStart] = useState(session ? toLocalInput(session.startsAt) : defaultStart());
  const [minutes, setMinutes] = useState(String(session?.durationMinutes ?? 60));
  const [location, setLocation] = useState(session?.location ?? '');
  const [agenda, setAgenda] = useState(session?.agenda ?? '');
  const [error, setError] = useState<unknown>(null);
  const save = useMutation({
    mutationFn: () => {
      const input = { startsAt: new Date(start).toISOString(), durationMinutes: Number(minutes), location, agenda };
      return session ? api.org(orgId).coaching.sessions.update(session.id, input) : api.org(orgId).coaching.sessions.create({ ...input, clientMembershipId: client });
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: coachingKey(orgId) }); toast(t('sessions.toastScheduled')); onClose(); },
    onError: (e) => { setError(e); toast(errorMessage(e), 'error'); },
  });
  const valid = (session || client) && start && Number(minutes) >= SESSION_LIMITS.minMinutes && Number(minutes) <= SESSION_LIMITS.maxMinutes;
  return (
    <Dialog open={open} onClose={onClose} title={session ? t('sessions.editTitle') : t('sessions.newTitle')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}>
        {error !== null && <ErrorAlert error={error} />}
        {!session && !clientId && (
          <Field label={t('sessions.client')}>{(c) => <Select {...c} value={client} onChange={(e) => setClient(e.target.value)}><option value="">{t('sessions.chooseClient')}</option>{clients?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('sessions.start')}>{(c) => <Input {...c} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label={t('sessions.duration')}>{(c) => <Input {...c} type="number" min={SESSION_LIMITS.minMinutes} max={SESSION_LIMITS.maxMinutes} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} />}</Field>
        </div>
        <Field label={t('sessions.location')}>{(c) => <Input {...c} dir="auto" maxLength={SESSION_LIMITS.location} value={location} onChange={(e) => setLocation(e.target.value)} />}</Field>
        <Field label={t('sessions.agenda')}>{(c) => <Textarea {...c} dir="auto" rows={3} maxLength={SESSION_LIMITS.agenda} value={agenda} onChange={(e) => setAgenda(e.target.value)} />}</Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" loading={save.isPending} disabled={!valid}>{session ? t('sessions.reschedule') : t('schedule')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
export function SessionRow({ session, manage }: { session: CoachSession; manage: boolean }) {
  const t = useTranslations('coaching.sessions');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [editing, setEditing] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: coachingKey(orgId) });
  const cancel = useMutation({ mutationFn: () => api.org(orgId).coaching.sessions.cancel(session.id), onSuccess: async () => { await refresh(); toast(t('toastCancelled')); }, onError: (e) => toast(errorMessage(e), 'error') });
  const held = useMutation({ mutationFn: () => api.org(orgId).coaching.sessions.complete(session.id), onSuccess: async () => { await refresh(); toast(t('toastHeld')); }, onError: (e) => toast(errorMessage(e), 'error') });
  const [mountedAt] = useState(() => Date.now()); // "has it started" is judged when the row appears; reloading refreshes it
  const started = new Date(session.startsAt).getTime() <= mountedAt;
  const planned = session.status === 'PLANNED';
  return (
    <li className="space-y-1 px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{format.dateTime(new Date(session.startsAt), { dateStyle: 'medium', timeStyle: 'short' })}</p>
        <span className="text-sm text-muted">· {t('minutes', { count: session.durationMinutes })} · {manage ? session.clientName : t('with', { name: session.coachName })}</span>
        <Badge tone={session.status === 'PLANNED' ? 'accent' : session.status === 'HELD' ? 'ok' : 'neutral'}>{t(`status.${session.status}`)}</Badge>
      </div>
      {session.location && (
        <p className="flex items-center gap-1.5 text-sm text-ink-2" dir="auto">
          {isLink(session.location) ? <Video className="size-4 text-muted" aria-hidden /> : <MapPin className="size-4 text-muted" aria-hidden />}
          {isLink(session.location) ? <a href={session.location} target="_blank" rel="noreferrer noopener" className="text-link hover:underline">{session.location}</a> : session.location}
        </p>
      )}
      {session.agenda && <p className="whitespace-pre-line text-sm text-muted" dir="auto">{session.agenda}</p>}
      {session.status === 'CANCELLED' && session.cancelReason && <p className="text-sm text-muted" dir="auto">{session.cancelReason}</p>}
      {manage && planned && (
        <div className="flex flex-wrap gap-2 pt-1">
          {started && <Button size="sm" variant="secondary" loading={held.isPending} onClick={() => held.mutate()}>{t('markHeld')}</Button>}
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>{t('reschedule')}</Button>
          <ConfirmButton size="sm" confirmLabel={t('cancelConfirm')} onConfirm={() => cancel.mutate()}>{t('cancelSession')}</ConfirmButton>
        </div>
      )}
      {editing && <SessionDialog open onClose={() => setEditing(false)} session={session} />}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------- trends

export function TrendCharts({ series }: { series: TrendSeries[] }) {
  const t = useTranslations('coaching.assessments');
  const locale = useLocale() as 'en' | 'ar';
  const format = useFormatter();
  if (series.length === 0) return <p className="text-sm text-muted">{t('noTrends')}</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {series.map((s) => {
        const label = s.label[locale].trim() || s.label[locale === 'en' ? 'ar' : 'en'];
        const latest = s.points[s.points.length - 1]!.value;
        return (
          <div key={s.questionId} className="rounded-md border border-line p-3">
            <p className="font-medium" dir="auto">{label}</p>
            <p className="mb-2 text-xs text-muted">{t('latest', { value: latest })}{s.change !== null && ` · ${t('change', { change: s.change })}`}</p>
            <LineChart points={s.points} label={label} unit="" formatDate={(iso) => format.dateTime(new Date(iso), { dateStyle: 'medium' })} formatValue={(v) => String(Math.round(v * 10) / 10)} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- answering

export function AssessmentDialog({ assessment, onClose }: { assessment: CoachAssessment; onClose: () => void }) {
  const t = useTranslations('coaching.assessments');
  const tc = useTranslations('coaching');
  const locale = useLocale() as 'en' | 'ar';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [answers, setAnswers] = useState<AssessmentAnswers>({});
  const [error, setError] = useState<unknown>(null);
  const submit = useMutation({
    mutationFn: () => api.org(orgId).coaching.assessments.submit(assessment.id, answers),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: coachingKey(orgId) }); toast(t('toastSubmitted')); onClose(); },
    onError: (e) => { setError(e); toast(errorMessage(e), 'error'); },
  });
  const complete = assessment.questions.every((q) => q.kind === 'TEXT' || answers[q.id] !== undefined);
  return (
    <Dialog open onClose={onClose} title={assessment.title} wide>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
        {error !== null && <ErrorAlert error={error} />}
        {assessment.questions.map((q) => <QuestionInput key={q.id} q={q} locale={locale} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />)}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" loading={submit.isPending} disabled={!complete}>{t('submit')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
function QuestionInput({ q, locale, value, onChange }: { q: AssessmentQuestion; locale: 'en' | 'ar'; value: AssessmentAnswers[string] | undefined; onChange: (v: number | boolean | string) => void }) {
  const t = useTranslations('coaching.assessments');
  const label = questionLabel(q, locale);
  if (q.kind === 'SCALE') {
    return (
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-2" dir="auto">{label}</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
          {Array.from({ length: ASSESSMENT_LIMITS.scaleMax }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)} className={`size-9 rounded-md border text-sm font-medium tabular-nums ${value === n ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface hover:border-selection-line'}`}>{n}</button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">{t('scaleHint')}</p>
      </fieldset>
    );
  }
  if (q.kind === 'YESNO') {
    return (
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-2" dir="auto">{label}</legend>
        <div className="flex gap-2" role="radiogroup" aria-label={label}>
          {[true, false].map((v) => (
            <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`h-9 rounded-md border px-4 text-sm font-medium ${value === v ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface hover:border-selection-line'}`}>{v ? t('yes') : t('no')}</button>
          ))}
        </div>
      </fieldset>
    );
  }
  return <Field label={label}>{(c) => <Textarea {...c} dir="auto" rows={3} maxLength={ASSESSMENT_LIMITS.text} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />}</Field>;
}

/** Read-only view of finished answers. */
export function AnswersView({ assessment }: { assessment: CoachAssessment }) {
  const t = useTranslations('coaching.assessments');
  const locale = useLocale() as 'en' | 'ar';
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {assessment.questions.map((q) => {
        const a = assessment.answers?.[q.id];
        return (
          <div key={q.id} className="flex justify-between gap-3 border-b border-line py-1">
            <dt className="text-muted" dir="auto">{questionLabel(q, locale)}</dt>
            <dd className="font-medium tabular-nums" dir="auto">{typeof a === 'boolean' ? (a ? t('yes') : t('no')) : (a ?? '—')}</dd>
          </div>
        );
      })}
    </dl>
  );
}

// ---------------------------------------------------------------------------------------------- resources

export function ResourceItem({ resource, onArchive }: { resource: CoachResource; onArchive?: () => void }) {
  const t = useTranslations('coaching.resources');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { orgId } = useOrg();
  const download = useMutation({
    mutationFn: async () => (await api.org(orgId).files.downloadUrl(resource.file!.fileId)).url,
    onSuccess: (url) => window.open(url, '_blank', 'noopener'),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium" dir="auto">{resource.title}</p>
        {resource.description && <p className="text-sm text-muted" dir="auto">{resource.description}</p>}
        <p className="text-xs text-muted">{t('from', { name: resource.createdByName })} · {resource.sharedWithAll ? t('allClients') : ''}</p>
      </div>
      {resource.url && <a href={resource.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline"><ExternalLink className="size-4" aria-hidden />{t('open')}</a>}
      {resource.file && <Button size="sm" variant="secondary" loading={download.isPending} onClick={() => download.mutate()}><FileDown className="size-4" aria-hidden />{resource.file.fileName}</Button>}
      {onArchive && <ConfirmButton size="sm" confirmLabel={t('archiveConfirm')} onConfirm={onArchive}>{t('archive')}</ConfirmButton>}
    </li>
  );
}

export function ResourceDialog({ open, onClose, clients, clientId }: { open: boolean; onClose: () => void; clients?: { id: string; name: string }[]; clientId?: string }) {
  const t = useTranslations('coaching.resources');
  const tc = useTranslations('coaching');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState(clientId ?? '');
  const [error, setError] = useState<unknown>(null);
  const picker = useRef<HTMLInputElement>(null);
  const share = useMutation({
    mutationFn: async () => {
      const stored = file ? await api.org(orgId).files.upload({ fileName: file.name, mimeType: file.type || 'application/octet-stream', body: file }) : null;
      return api.org(orgId).coaching.resources.create({ title, description: description || undefined, url: url || undefined, fileId: stored?.id, clientMembershipId: target || undefined });
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: coachingKey(orgId) }); toast(t('toastShared')); onClose(); },
    onError: (e) => { setError(e); toast(errorMessage(e), 'error'); },
  });
  return (
    <Dialog open={open} onClose={onClose} title={t('newTitle')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); share.mutate(); }}>
        {error !== null && <ErrorAlert error={error} />}
        <Field label={t('titleField')}>{(c) => <Input {...c} dir="auto" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label={t('description')}>{(c) => <Input {...c} dir="auto" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Field label={t('url')} hint={t('urlHint')}>{(c) => <Input {...c} type="url" dir="ltr" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />}</Field>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-2">{t('file')}</p>
          <input ref={picker} type="file" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => picker.current?.click()}>{file ? file.name : t('file')}</Button>
            {file && <Button variant="ghost" size="sm" onClick={() => setFile(null)}>{tc('cancel')}</Button>}
          </div>
        </div>
        {!clientId && (
          <Field label={t('shareWith')}>{(c) => <Select {...c} value={target} onChange={(e) => setTarget(e.target.value)}><option value="">{t('everyone')}</option>{clients?.map((x) => <option key={x.id} value={x.id}>{t('onlyThem', { name: x.name })}</option>)}</Select>}</Field>
        )}
        {!url && !file && <p className="text-xs text-muted">{t('needOne')}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" loading={share.isPending} disabled={!title.trim() || (!url && !file)}>{t('new')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function useClientsOptions() {
  const { orgId } = useOrg();
  const members = useQuery({ queryKey: orgKey(orgId, 'members', 'coaching-clients'), queryFn: () => api.org(orgId).members.list({ status: 'ACTIVE', limit: 100 }) });
  const clients = (members.data?.data ?? []).filter((m) => m.role.key === 'participant').map((m) => ({ id: m.id, name: m.fullName }));
  return { clients, loading: members.isPending, error: members.error };
}

export { Card, CardBody, CardHeader, CardTitle };
