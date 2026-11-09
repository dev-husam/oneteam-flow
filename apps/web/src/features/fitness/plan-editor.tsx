'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type Exercise, type PlanVersion } from '@pt/api-client';
import { PLAN_LIMITS, validatePlanContent, type PlanDayInput, type PlanIssue } from '@pt/domain';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { useDebounced } from '@/lib/use-debounced';
import { AssignDialog } from './assign-dialog';
import { useExerciseName } from './labels';

// ---------------------------------------------------------------- editable model (numbers are text while typing)

interface EEx { key: string; exerciseId: string; exercise: Exercise; sets: string; repsMin: string; repsMax: string; weight: string; rest: string; superset: string; notes: string }
interface EDay { key: string; name: string; exercises: EEx[] }

let counter = 0;
const nextKey = () => `k${++counter}`;
const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s));

const toEditable = (v: PlanVersion): EDay[] =>
  v.days.map((d) => ({
    key: nextKey(), name: d.name,
    exercises: d.exercises.map((e) => ({ key: nextKey(), exerciseId: e.exerciseId, exercise: e.exercise, sets: String(e.sets), repsMin: String(e.repsMin), repsMax: String(e.repsMax), weight: e.targetWeightKg === null ? '' : String(e.targetWeightKg), rest: String(e.restSeconds), superset: e.supersetGroup === null ? '' : String(e.supersetGroup), notes: e.notes ?? '' })),
  }));

const toInput = (days: EDay[]): PlanDayInput[] =>
  days.map((d) => ({
    name: d.name.trim(),
    exercises: d.exercises.map((e) => ({
      exerciseId: e.exerciseId, sets: num(e.sets), repsMin: num(e.repsMin), repsMax: num(e.repsMax), targetWeightKg: e.weight.trim() === '' ? null : num(e.weight),
      restSeconds: num(e.rest), supersetGroup: e.superset.trim() === '' ? null : num(e.superset), notes: e.notes.trim() || null,
    })),
  }));

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  copy.splice(to, 0, copy.splice(from, 1)[0]!);
  return copy;
}

// ---------------------------------------------------------------- pieces

function ExercisePicker({ onPick, onClose }: { onPick: (e: Exercise) => void; onClose: () => void }) {
  const t = useTranslations('fitness');
  const exerciseName = useExerciseName();
  const { orgId } = useOrg();
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const list = useQuery({ queryKey: orgKey(orgId, 'fitness', 'exercises', 'picker', search), queryFn: () => api.org(orgId).fitness.exercises.list({ q: search || undefined }) });
  return (
    <Dialog open onClose={onClose} title={t('plans.pickExercise')}>
      <div className="space-y-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('exercises.searchPlaceholder')} aria-label={t('exercises.search')} autoFocus />
        {list.isError && <ErrorAlert error={list.error} />}
        <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-md border border-line">
          {list.data?.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onPick(e)} className="flex w-full items-center gap-2 px-3 py-2.5 text-start hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{exerciseName(e)}</span>
                <Badge>{t(`muscle.${e.muscleGroup}`)}</Badge>
              </button>
            </li>
          ))}
          {list.data?.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t('exercises.empty')}</li>}
        </ul>
      </div>
    </Dialog>
  );
}

function NumberField({ label, value, onChange, step = '1', className = 'w-20' }: { label: string; value: string; onChange: (v: string) => void; step?: string; className?: string }) {
  return (
    <label className="space-y-1 text-xs text-muted">
      <span className="block">{label}</span>
      <Input type="number" inputMode="decimal" step={step} min={0} value={value} onChange={(e) => onChange(e.target.value)} className={`h-9 ${className}`} />
    </label>
  );
}

function ReadOnlyVersion({ version }: { version: PlanVersion }) {
  const t = useTranslations('fitness');
  const exerciseName = useExerciseName();
  return (
    <div className="space-y-4">
      {version.notes && <p className="whitespace-pre-wrap text-sm text-ink-2">{version.notes}</p>}
      {version.days.map((d) => (
        <Card key={d.id}>
          <CardHeader><CardTitle>{d.dayIndex}. {d.name}</CardTitle></CardHeader>
          <ul className="divide-y divide-line">
            {d.exercises.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 font-medium">{exerciseName(e.exercise)}</span>
                <span className="tabular-nums text-ink-2">{t('plans.setsReps', { sets: e.sets, min: e.repsMin, max: e.repsMax })}</span>
                {e.targetWeightKg !== null && <span className="tabular-nums text-muted">{e.targetWeightKg} kg</span>}
                <span className="tabular-nums text-muted">{t('plans.restShort', { seconds: e.restSeconds })}</span>
                {e.supersetGroup !== null && <Badge tone="accent">{t('plans.superset', { n: e.supersetGroup })}</Badge>}
                {e.notes && <span className="basis-full text-xs text-muted">{e.notes}</span>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function DraftEditor({ planId, version, hasPublished, onPublished }: { planId: string; version: PlanVersion; hasPublished: boolean; onPublished: () => void }) {
  const t = useTranslations('fitness');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const exerciseName = useExerciseName();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [notes, setNotes] = useState(version.notes ?? '');
  const [days, setDays] = useState<EDay[]>(() => toEditable(version));
  const [dirty, setDirty] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [serverIssues, setServerIssues] = useState<PlanIssue[]>([]);

  const edit = (fn: (d: EDay[]) => EDay[]) => { setDays(fn); setDirty(true); setServerIssues([]); };
  const patchEx = (di: number, ei: number, patch: Partial<EEx>) => edit((all) => all.map((d, i) => (i !== di ? d : { ...d, exercises: d.exercises.map((e, j) => (j === ei ? { ...e, ...patch } : e)) })));
  const issues = [...validatePlanContent(toInput(days), { forPublish: true }), ...serverIssues];
  const issuesAt = (prefix: string) => (showIssues ? issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`) || i.path.startsWith(`${prefix}[`)) : []);

  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness', 'plans') }); };
  const onError = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'PLAN_INVALID') { setServerIssues(e.issues); setShowIssues(true); }
    toast(errorMessage(e), 'error');
  };
  const save = useMutation({
    mutationFn: () => api.org(orgId).fitness.plans.saveContent(planId, version.id, { notes: notes.trim() || null, days: toInput(days) }),
    onSuccess: async () => { setDirty(false); await refresh(); toast(t('plans.draftSaved')); },
    onError,
  });
  const publish = useMutation({
    mutationFn: async () => {
      await api.org(orgId).fitness.plans.saveContent(planId, version.id, { notes: notes.trim() || null, days: toInput(days) });
      return api.org(orgId).fitness.plans.publish(planId, version.id);
    },
    onSuccess: async () => { setDirty(false); await refresh(); toast(t('plans.published')); onPublished(); },
    onError,
  });
  const discard = useMutation({
    mutationFn: () => api.org(orgId).fitness.plans.discardDraft(planId, version.id),
    onSuccess: async () => { await refresh(); toast(t('plans.draftDiscarded')); onPublished(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const label = (rule: string) => (t.has(`plans.rule.${rule}` as 'plans.rule.range') ? t(`plans.rule.${rule}` as 'plans.rule.range') : t('plans.rule.invalid'));

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <Field label={t('plans.versionNotes')} optionalLabel={t('optional')}>
            {(c) => <Textarea {...c} rows={2} maxLength={2000} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} />}
          </Field>
        </CardBody>
      </Card>

      {days.map((day, di) => {
        const dayIssues = issuesAt(`days[${di}]`).filter((i) => i.path === `days[${di}].name` || i.path === `days[${di}].exercises`);
        return (
          <Card key={day.key}>
            <CardHeader className="flex-row flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-muted">{di + 1}.</span>
              <Input aria-label={t('plans.dayName')} value={day.name} onChange={(e) => edit((all) => all.map((d, i) => (i === di ? { ...d, name: e.target.value } : d)))} placeholder={t('plans.dayNamePlaceholder')} maxLength={80} className="h-9 max-w-xs flex-1" />
              <span className="ms-auto flex gap-1">
                <Button size="icon" variant="ghost" aria-label={t('plans.moveDayUp')} disabled={di === 0} onClick={() => edit((all) => move(all, di, di - 1))}><ArrowUp className="size-4" aria-hidden /></Button>
                <Button size="icon" variant="ghost" aria-label={t('plans.moveDayDown')} disabled={di === days.length - 1} onClick={() => edit((all) => move(all, di, di + 1))}><ArrowDown className="size-4" aria-hidden /></Button>
                <Button size="icon" variant="ghost" aria-label={t('plans.removeDay')} onClick={() => edit((all) => all.filter((_, i) => i !== di))}><Trash2 className="size-4" aria-hidden /></Button>
              </span>
            </CardHeader>
            {dayIssues.length > 0 && <p role="alert" className="px-5 pt-3 text-xs font-medium text-danger">{dayIssues.map((i) => label(i.rule)).join(' · ')}</p>}
            <ul className="divide-y divide-line">
              {day.exercises.map((ex, ei) => {
                const exIssues = issuesAt(`days[${di}].exercises[${ei}]`);
                return (
                  <li key={ex.key} className="space-y-2 px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{exerciseName(ex.exercise)}</span>
                      <Badge>{t(`muscle.${ex.exercise.muscleGroup}`)}</Badge>
                      <Button size="icon" variant="ghost" aria-label={t('plans.moveUp')} disabled={ei === 0} onClick={() => edit((all) => all.map((d, i) => (i === di ? { ...d, exercises: move(d.exercises, ei, ei - 1) } : d)))}><ArrowUp className="size-4" aria-hidden /></Button>
                      <Button size="icon" variant="ghost" aria-label={t('plans.moveDown')} disabled={ei === day.exercises.length - 1} onClick={() => edit((all) => all.map((d, i) => (i === di ? { ...d, exercises: move(d.exercises, ei, ei + 1) } : d)))}><ArrowDown className="size-4" aria-hidden /></Button>
                      <Button size="icon" variant="ghost" aria-label={t('plans.removeExercise', { name: exerciseName(ex.exercise) })} onClick={() => edit((all) => all.map((d, i) => (i === di ? { ...d, exercises: d.exercises.filter((_, j) => j !== ei) } : d)))}><Trash2 className="size-4" aria-hidden /></Button>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <NumberField label={t('plans.sets')} value={ex.sets} onChange={(v) => patchEx(di, ei, { sets: v })} className="w-16" />
                      <NumberField label={t('plans.repsMin')} value={ex.repsMin} onChange={(v) => patchEx(di, ei, { repsMin: v })} className="w-16" />
                      <NumberField label={t('plans.repsMax')} value={ex.repsMax} onChange={(v) => patchEx(di, ei, { repsMax: v })} className="w-16" />
                      <NumberField label={t('plans.weight')} value={ex.weight} onChange={(v) => patchEx(di, ei, { weight: v })} step="0.5" className="w-20" />
                      <NumberField label={t('plans.rest')} value={ex.rest} onChange={(v) => patchEx(di, ei, { rest: v })} step="5" className="w-20" />
                      <NumberField label={t('plans.supersetLabel')} value={ex.superset} onChange={(v) => patchEx(di, ei, { superset: v })} className="w-16" />
                      <label className="min-w-[10rem] flex-1 space-y-1 text-xs text-muted">
                        <span className="block">{t('plans.exerciseNotes')}</span>
                        <Input value={ex.notes} onChange={(e) => patchEx(di, ei, { notes: e.target.value })} maxLength={500} className="h-9" />
                      </label>
                    </div>
                    {exIssues.length > 0 && <p role="alert" className="text-xs font-medium text-danger">{[...new Set(exIssues.map((i) => label(i.rule)))].join(' · ')}</p>}
                  </li>
                );
              })}
            </ul>
            <div className="px-5 py-3">
              <Button size="sm" variant="secondary" disabled={day.exercises.length >= PLAN_LIMITS.maxExercisesPerDay} onClick={() => setPicking(di)}><Plus className="size-4" aria-hidden />{t('plans.addExercise')}</Button>
            </div>
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={days.length >= PLAN_LIMITS.maxDays} onClick={() => edit((all) => [...all, { key: nextKey(), name: '', exercises: [] }])}><Plus className="size-4" aria-hidden />{t('plans.addDay')}</Button>
        <span className="ms-auto flex flex-wrap items-center gap-2">
          {hasPublished && <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => discard.mutate()}>{t('plans.discardDraft')}</ConfirmButton>}
          <Button variant="secondary" loading={save.isPending} disabled={!dirty} onClick={() => { setShowIssues(false); save.mutate(); }}>{t('plans.saveDraft')}</Button>
          <Button loading={publish.isPending} onClick={() => { setShowIssues(true); if (validatePlanContent(toInput(days), { forPublish: true }).length === 0) publish.mutate(); else toast(t('plans.fixIssues'), 'error'); }}>{t('plans.publish')}</Button>
        </span>
      </div>
      {showIssues && issues.length > 0 && <p role="alert" className="text-sm font-medium text-danger">{t('plans.fixIssues')}</p>}
      {picking !== null && (
        <ExercisePicker
          onClose={() => setPicking(null)}
          onPick={(exercise) => {
            const di = picking;
            edit((all) => all.map((d, i) => (i === di ? { ...d, exercises: [...d.exercises, { key: nextKey(), exerciseId: exercise.id, exercise, sets: '3', repsMin: '8', repsMax: '12', weight: '', rest: '90', superset: '', notes: '' }] } : d)));
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}

function RenameDialog({ planId, name, description, onClose }: { planId: string; name: string; description: string | null; onClose: () => void }) {
  const t = useTranslations('fitness');
  const queryClient = useQueryClient();
  const toast = useToast();
  const { orgId } = useOrg();
  const [n, setN] = useState(name);
  const [d, setD] = useState(description ?? '');
  const save = useMutation({
    mutationFn: () => api.org(orgId).fitness.plans.update(planId, { name: n.trim(), description: d.trim() }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness', 'plans') }); toast(t('plans.saved')); onClose(); },
  });
  return (
    <Dialog open onClose={onClose} title={t('plans.editTitle')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        {save.isError && <ErrorAlert error={save.error} />}
        <Field label={t('plans.name')}>{(c) => <Input {...c} value={n} onChange={(e) => setN(e.target.value)} maxLength={120} autoFocus />}</Field>
        <Field label={t('plans.description')} optionalLabel={t('optional')}>{(c) => <Input {...c} value={d} onChange={(e) => setD(e.target.value)} maxLength={1000} />}</Field>
        <Button type="submit" loading={save.isPending} disabled={n.trim().length < 2} className="w-full">{t('save')}</Button>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- page

export function PlanEditor({ planId }: { planId: string }) {
  const t = useTranslations('fitness');
  const format = useFormatter();
  const toast = useToast();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, slug, can } = useOrg();
  const [picked, setPicked] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const detail = useQuery({ queryKey: orgKey(orgId, 'fitness', 'plans', planId), queryFn: () => api.org(orgId).fitness.plans.get(planId), retry: (c, e) => c < 2 && !(e instanceof ApiError && e.status < 500) });
  const versionId = picked ?? detail.data?.draftVersionId ?? detail.data?.currentVersion?.id ?? null;
  const version = useQuery({ queryKey: orgKey(orgId, 'fitness', 'plans', planId, 'version', versionId), queryFn: () => api.org(orgId).fitness.plans.getVersion(planId, versionId!), enabled: Boolean(versionId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness', 'plans') });

  const newVersion = useMutation({
    mutationFn: () => api.org(orgId).fitness.plans.createVersion(planId),
    onSuccess: async (v) => { await refresh(); setPicked(v.id); toast(t('plans.draftCreated')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const archive = useMutation({
    mutationFn: () => api.org(orgId).fitness.plans.archive(planId),
    onSuccess: async () => { await refresh(); toast(t('plans.archivedToast')); router.replace(`/o/${slug}/plans`); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (detail.isPending) return <Skeleton className="h-64" />;
  if (detail.isError) return <div className="space-y-4"><ErrorAlert error={detail.error} /><Link href={`/o/${slug}/plans`} className="text-sm font-medium text-link hover:underline">{t('plans.back')}</Link></div>;
  const p = detail.data;

  return (
    <>
      <Link href={`/o/${slug}/plans`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t('plans.back')}</Link>
      <PageHeader
        title={p.name}
        description={p.description ?? t('plans.createdBy', { name: p.createdByName })}
        actions={!p.archived && (
          <>
            <Button variant="secondary" size="sm" onClick={() => setRenaming(true)}>{t('edit')}</Button>
            {can('fitness.workout_plan.assign') && p.currentVersion && <Button size="sm" onClick={() => setAssigning(true)}>{t('plans.assign')}</Button>}
            <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => archive.mutate()}>{t('plans.archive')}</ConfirmButton>
          </>
        )}
      />
      {p.archived && <p className="mb-4 text-sm text-muted">{t('plans.archivedNotice')}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label={t('plans.version')} value={versionId ?? ''} onChange={(e) => setPicked(e.target.value)} className="h-9 w-72">
          {[...p.versions].reverse().map((v) => (
            <option key={v.id} value={v.id}>
              {v.publishedAt ? t('plans.versionPublished', { n: v.versionNo, date: format.dateTime(new Date(v.publishedAt), { dateStyle: 'medium' }) }) : t('plans.versionDraft', { n: v.versionNo })}
            </option>
          ))}
        </Select>
        {version.data && (version.data.published ? <Badge tone="ok">{t('plans.lockedBadge')}</Badge> : <Badge tone="accent">{t('plans.draftBadge')}</Badge>)}
        {p.currentVersion && p.currentVersion.id === versionId && <Badge>{t('plans.currentBadge')}</Badge>}
        {!p.archived && !p.draftVersionId && p.currentVersion && (
          <Button size="sm" variant="secondary" loading={newVersion.isPending} onClick={() => newVersion.mutate()}>{t('plans.newVersion')}</Button>
        )}
      </div>
      {version.data?.published && <p className="mb-4 text-sm text-muted">{t('plans.lockedHint')}</p>}

      {version.isPending && versionId && <Skeleton className="h-48" />}
      {version.isError && <ErrorAlert error={version.error} />}
      {version.data && (version.data.published || p.archived
        ? <ReadOnlyVersion version={version.data} />
        : <DraftEditor key={version.data.id} planId={planId} version={version.data} hasPublished={Boolean(p.currentVersion)} onPublished={() => setPicked(null)} />)}

      {assigning && <AssignDialog planId={planId} onClose={() => setAssigning(false)} />}
      {renaming && <RenameDialog planId={planId} name={p.name} description={p.description} onClose={() => setRenaming(false)} />}
    </>
  );
}
