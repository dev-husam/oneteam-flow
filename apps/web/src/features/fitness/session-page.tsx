'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type SessionDetail, type SessionExercise } from '@pt/api-client';
import { ArrowLeft, Check, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useExerciseName } from './labels';

function SetRow({ session, ex, setNo, onSession }: { session: SessionDetail; ex: SessionExercise; setNo: number; onSession: (s: SessionDetail) => void }) {
  const t = useTranslations('fitness');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { orgId } = useOrg();
  const logged = ex.logged.find((l) => l.setNo === setNo);
  const before = ex.previous?.sets.find((s) => s.setNo === setNo);
  // Start from what is logged, else what was done last time, else the target.
  const [reps, setReps] = useState(logged ? String(logged.repsDone) : before ? String(before.repsDone) : String(ex.repsMax));
  const [weight, setWeight] = useState(logged ? (logged.weightKg === null ? '' : String(logged.weightKg)) : before?.weightKg != null ? String(before.weightKg) : ex.targetWeightKg !== null ? String(ex.targetWeightKg) : '');
  const changed = !logged || String(logged.repsDone) !== reps || (logged.weightKg === null ? '' : String(logged.weightKg)) !== weight;

  const log = useMutation({
    mutationFn: () => api.org(orgId).fitness.sessions.logSet(session.id, { dayExerciseId: ex.dayExerciseId, setNo, repsDone: Number(reps), weightKg: weight.trim() === '' ? null : Number(weight) }),
    onSuccess: onSession,
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api.org(orgId).fitness.sessions.removeSet(session.id, ex.dayExerciseId, setNo),
    onSuccess: onSession,
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const valid = reps.trim() !== '' && Number.isInteger(Number(reps)) && Number(reps) >= 0 && (weight.trim() === '' || Number(weight) >= 0);

  return (
    <tr className="align-middle">
      <th scope="row" className="py-1.5 pe-3 text-start text-sm font-medium tabular-nums">{setNo}</th>
      <td className="py-1.5 pe-3 text-xs text-muted tabular-nums">{before ? `${before.repsDone} × ${before.weightKg ?? '—'}` : '—'}</td>
      <td className="py-1.5 pe-2"><Input aria-label={t('session.reps', { n: setNo })} type="number" inputMode="numeric" min={0} value={reps} onChange={(e) => setReps(e.target.value)} className="h-9 w-20" /></td>
      <td className="py-1.5 pe-2"><Input aria-label={t('session.weight', { n: setNo })} type="number" inputMode="decimal" step="0.5" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} className="h-9 w-24" /></td>
      <td className="w-44 py-1.5">
        <span className="flex items-center gap-1">
          <Button size="sm" variant={logged && !changed ? 'secondary' : 'primary'} loading={log.isPending} disabled={!valid || !changed} onClick={() => log.mutate()}>
            {logged && !changed ? <><Check className="size-4 text-ok" aria-hidden />{t('session.logged')}</> : logged ? t('session.update') : t('session.log')}
          </Button>
          {logged && <Button size="icon" variant="ghost" aria-label={t('session.removeSet', { n: setNo })} loading={remove.isPending} onClick={() => remove.mutate()}><Trash2 className="size-4" aria-hidden /></Button>}
        </span>
      </td>
    </tr>
  );
}

function FinishDialog({ session, onClose, onDone }: { session: SessionDetail; onClose: () => void; onDone: (s: SessionDetail) => void }) {
  const t = useTranslations('fitness');
  const { orgId } = useOrg();
  const [rpe, setRpe] = useState('');
  const [notes, setNotes] = useState('');
  const finish = useMutation({
    mutationFn: () => api.org(orgId).fitness.sessions.complete(session.id, { rpe: rpe ? Number(rpe) : undefined, notes: notes.trim() || undefined }),
    onSuccess: onDone,
  });
  return (
    <Dialog open onClose={onClose} title={t('session.finishTitle')} description={t('session.finishBody')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); finish.mutate(); }}>
        {finish.isError && <ErrorAlert error={finish.error} />}
        <Field label={t('session.rpe')} hint={t('session.rpeHint')} optionalLabel={t('optional')}>
          {(c) => <Select {...c} value={rpe} onChange={(e) => setRpe(e.target.value)}><option value="">—</option>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</Select>}
        </Field>
        <Field label={t('session.notes')} optionalLabel={t('optional')}>{(c) => <Textarea {...c} rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        <Button type="submit" loading={finish.isPending} className="w-full">{t('session.finish')}</Button>
      </form>
    </Dialog>
  );
}

/** Logs a workout set by set. The client edits their own open session; trainers see it read-only. */
export function SessionPage({ sessionId }: { sessionId: string }) {
  const t = useTranslations('fitness');
  const format = useFormatter();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const exerciseName = useExerciseName();
  const { orgId, slug } = useOrg();
  const [finishing, setFinishing] = useState(false);
  const [extra, setExtra] = useState<Record<string, number>>({});
  const key = orgKey(orgId, 'fitness', 'sessions', 'detail', sessionId);
  const query = useQuery({ queryKey: key, queryFn: () => api.org(orgId).fitness.sessions.get(sessionId), retry: (c, e) => c < 2 && !(e instanceof ApiError && e.status < 500) });
  const update = (s: SessionDetail) => queryClient.setQueryData(key, s);

  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <div className="space-y-4"><ErrorAlert error={query.error} /><Link href={`/o/${slug}/workouts`} className="text-sm font-medium text-link hover:underline">{t('session.back')}</Link></div>;
  const s = query.data;
  const totalSets = s.exercises.reduce((n, e) => n + e.logged.length, 0);

  return (
    <>
      <Link href={`/o/${slug}/workouts`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t('session.back')}</Link>
      <PageHeader
        title={s.dayName}
        description={`${s.planName} · ${format.dateTime(new Date(`${s.scheduledDate}T00:00:00`), { dateStyle: 'full' })}${s.editable ? '' : ` · ${s.clientName}`}`}
        actions={s.completedAt ? <Badge tone="ok">{t('workouts.completed')}</Badge> : s.editable ? <Button disabled={totalSets === 0} onClick={() => setFinishing(true)}>{t('session.finish')}</Button> : <Badge tone="warn">{t('workouts.inProgress')}</Badge>}
      />
      {s.dayNotes && <p className="mb-4 whitespace-pre-wrap text-sm text-ink-2">{s.dayNotes}</p>}
      {s.completedAt && (
        <Card className="mb-4"><CardBody>
          <dl className="grid grid-cols-3 gap-4">
            <div><dt className="text-xs text-muted">{t('session.volumeLabel')}</dt><dd className="text-lg font-semibold tabular-nums">{format.number(s.volume, { maximumFractionDigits: 0 })} kg</dd></div>
            <div><dt className="text-xs text-muted">{t('session.setsLabel')}</dt><dd className="text-lg font-semibold tabular-nums">{totalSets}</dd></div>
            <div><dt className="text-xs text-muted">{t('session.rpe')}</dt><dd className="text-lg font-semibold tabular-nums">{s.rpe ?? '—'}</dd></div>
          </dl>
          {s.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-2">{s.notes}</p>}
        </CardBody></Card>
      )}

      <div className="space-y-4">
        {s.exercises.map((ex) => {
          const count = Math.max(ex.sets, ...ex.logged.map((l) => l.setNo), 0) + (extra[ex.dayExerciseId] ?? 0);
          return (
            <Card key={ex.dayExerciseId} className="anim-rise">
              <CardHeader>
                <CardTitle>{exerciseName(ex.exercise)}</CardTitle>
                <p className="text-sm text-muted">
                  {t('plans.setsReps', { sets: ex.sets, min: ex.repsMin, max: ex.repsMax })}
                  {ex.targetWeightKg !== null && ` · ${ex.targetWeightKg} kg`} · {t('plans.restShort', { seconds: ex.restSeconds })}
                  {ex.supersetGroup !== null && ` · ${t('plans.superset', { n: ex.supersetGroup })}`}
                </p>
                {ex.notes && <p className="text-xs text-muted">{ex.notes}</p>}
                {ex.previous && <p className="text-xs text-muted">{t('session.lastTime', { date: format.dateTime(new Date(`${ex.previous.date}T00:00:00`), { dateStyle: 'medium' }) })}</p>}
              </CardHeader>
              <CardBody>
                {s.editable ? (
                  <>
                    <table className="w-full text-sm">
                      <thead><tr className="text-start text-xs text-muted"><th scope="col" className="pe-3 text-start font-medium">{t('session.set')}</th><th scope="col" className="pe-3 text-start font-medium">{t('session.previous')}</th><th scope="col" className="pe-2 text-start font-medium">{t('session.repsLabel')}</th><th scope="col" className="pe-2 text-start font-medium">{t('session.weightLabel')}</th><th scope="col" className="w-44"><span className="sr-only">{t('session.log')}</span></th></tr></thead>
                      <tbody>{Array.from({ length: count }, (_, i) => <SetRow key={i + 1} session={s} ex={ex} setNo={i + 1} onSession={update} />)}</tbody>
                    </table>
                    <Button size="sm" variant="ghost" className="mt-2" onClick={() => setExtra({ ...extra, [ex.dayExerciseId]: (extra[ex.dayExerciseId] ?? 0) + 1 })}>{t('session.addSet')}</Button>
                  </>
                ) : ex.logged.length === 0 ? (
                  <p className="text-sm text-muted">{t('session.nothingLogged')}</p>
                ) : (
                  <ol className="space-y-1 text-sm tabular-nums">
                    {ex.logged.map((l) => <li key={l.setNo}>{t('session.setLine', { n: l.setNo, reps: l.repsDone, weight: l.weightKg ?? '—' })}</li>)}
                  </ol>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
      {finishing && <FinishDialog session={s} onClose={() => setFinishing(false)} onDone={(done) => { update(done); setFinishing(false); void queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness') }); toast(t('session.finished')); router.push(`/o/${slug}/workouts`); }} />}
    </>
  );
}
