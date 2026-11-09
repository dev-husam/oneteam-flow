'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MealLogStatusKey, NutritionToday } from '@pt/api-client';
import { addDays } from '@pt/domain';
import { Apple, Camera, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { SecureImage } from './secure-image';
import { uploadImage } from './upload-image';

type Meal = NutritionToday['items'][number]['meals'][number];
const STATUSES: MealLogStatusKey[] = ['COMPLETED', 'PARTIAL', 'SKIPPED'];
const TONE = { COMPLETED: 'ok', PARTIAL: 'warn', SKIPPED: 'neutral' } as const;
const MAX_PHOTOS = 3;

function MealCard({ assignmentId, meal, date, onChanged }: { assignmentId: string; meal: Meal; date: string; onChanged: () => void }) {
  const t = useTranslations('nutrition');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { orgId } = useOrg();
  const input = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState(meal.log?.notes ?? '');
  const log = meal.log;
  const fail = (e: unknown) => toast(errorMessage(e), 'error');
  const setStatus = useMutation({
    mutationFn: (status: MealLogStatusKey) => api.org(orgId).fitness.nutrition.logMeal({ assignmentId, mealId: meal.mealId, logDate: date, status, notes: notes.trim() || null }),
    onSuccess: onChanged, onError: fail,
  });
  const addPhoto = useMutation({
    mutationFn: async (file: File) => {
      const l = log ?? (await api.org(orgId).fitness.nutrition.logMeal({ assignmentId, mealId: meal.mealId, logDate: date, status: 'COMPLETED', notes: notes.trim() || null }));
      const stored = await uploadImage(orgId, file, { sensitive: false });
      await api.org(orgId).fitness.nutrition.attachMealPhoto(l.id, stored.id);
    },
    onSuccess: onChanged, onError: fail,
  });
  const removePhoto = useMutation({ mutationFn: (fileId: string) => api.org(orgId).fitness.nutrition.detachMealPhoto(log!.id, fileId), onSuccess: onChanged, onError: fail });

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{t(`mealType.${meal.mealType}`)}</p>
        {meal.timeOfDay && <span className="text-sm text-muted tabular-nums">{meal.timeOfDay}</span>}
        {log && <Badge tone={TONE[log.status]}>{t(`status.${log.status}`)}</Badge>}
        <span className="ms-auto text-xs text-muted tabular-nums">{t('totalsShort', { kcal: meal.totals.calories })}</span>
      </div>
      <ul className="space-y-0.5 text-sm text-ink-2">
        {meal.items.map((i) => <li key={i.id}>{i.name}{i.quantity !== null ? ` · ${i.quantity}${i.unit ? ` ${i.unit}` : ''}` : ''}{i.calories !== null ? ` · ${i.calories} kcal` : ''}</li>)}
      </ul>
      {meal.notes && <p className="text-xs text-muted">{meal.notes}</p>}
      <div role="group" aria-label={t('logAs')} className="flex flex-wrap gap-2">
        {STATUSES.map((s) => <Button key={s} size="sm" variant={log?.status === s ? 'primary' : 'secondary'} aria-pressed={log?.status === s} loading={setStatus.isPending && setStatus.variables === s} onClick={() => setStatus.mutate(s)}>{t(`status.${s}`)}</Button>)}
      </div>
      {log && (
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label={t('notes')} placeholder={t('notesPlaceholder')} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (notes.trim() !== (log.notes ?? '')) setStatus.mutate(log.status); }} className="h-9 min-w-[12rem] flex-1" />
        </div>
      )}
      <div className="flex flex-wrap items-start gap-2">
        {log?.photoFileIds.map((id) => (
          <div key={id} className="relative w-20">
            <SecureImage fileId={id} alt={t('mealPhoto')} />
            <Button size="icon" variant="secondary" className="absolute end-1 top-1 size-7" aria-label={t('removePhoto')} loading={removePhoto.isPending && removePhoto.variables === id} onClick={() => removePhoto.mutate(id)}><Trash2 className="size-3.5" aria-hidden /></Button>
          </div>
        ))}
        {(log?.photoFileIds.length ?? 0) < MAX_PHOTOS && (
          <>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addPhoto.mutate(f); }} />
            <Button size="sm" variant="ghost" loading={addPhoto.isPending} onClick={() => input.current?.click()}><Camera className="size-4" aria-hidden />{t('addPhoto')}</Button>
          </>
        )}
      </div>
    </li>
  );
}

/** The client's meals for a day (today and the six days before), with one-tap logging and optional photos. */
export function NutritionPage() {
  const t = useTranslations('nutrition');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [offset, setOffset] = useState(0);
  const base = useQuery({ queryKey: orgKey(orgId, 'fitness', 'nutrition', 'today', 0), queryFn: () => api.org(orgId).fitness.nutrition.today() });
  const date = base.data ? addDays(base.data.today, -offset) : undefined;
  const day = useQuery({ queryKey: orgKey(orgId, 'fitness', 'nutrition', 'today', offset), queryFn: () => api.org(orgId).fitness.nutrition.today(date), enabled: Boolean(date) && offset > 0 ? true : Boolean(base.data), initialData: offset === 0 ? base.data : undefined });
  const refresh = () => queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness', 'nutrition') });
  const shown = offset === 0 ? base.data : day.data;

  return (
    <>
      <PageHeader title={t('myTitle')} description={shown ? format.dateTime(new Date(`${shown.date}T00:00:00`), { dateStyle: 'full' }) : t('mySubtitle')} actions={
        <div className="flex items-center gap-1">
          <Button size="icon" variant="secondary" aria-label={t('earlier')} disabled={offset >= 6} onClick={() => setOffset((o) => o + 1)}><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden /></Button>
          <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(0)}>{t('todayButton')}</Button>
          <Button size="icon" variant="secondary" aria-label={t('later')} disabled={offset === 0} onClick={() => setOffset((o) => o - 1)}><ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></Button>
        </div>
      } />
      {base.isPending && <Skeleton className="h-48" />}
      {base.isError && <ErrorAlert error={base.error} />}
      {day.isError && offset > 0 && <ErrorAlert error={day.error} />}
      {shown && shown.items.length === 0 && <Card><EmptyState icon={Apple} title={t('nothingPlanned')}>{t('nothingPlannedBody')}</EmptyState></Card>}
      {shown && shown.adherencePct !== null && <p className="mb-4 text-sm text-ink-2">{t('dayAdherence', { pct: shown.adherencePct })}</p>}
      <div className="space-y-6">
        {shown?.items.map((item) => (
          <Card key={item.assignmentId} className="anim-rise">
            <CardHeader><CardTitle>{item.planName}</CardTitle>{item.dayNotes && <p className="text-sm text-muted">{item.dayNotes}</p>}</CardHeader>
            {item.meals.length === 0 ? <CardBody><p className="text-sm text-muted">{t('freeDay')}</p></CardBody> : <ul className="divide-y divide-line">{item.meals.map((m) => <MealCard key={m.mealId} assignmentId={item.assignmentId} meal={m} date={shown.date} onChanged={() => void refresh()} />)}</ul>}
          </Card>
        ))}
      </div>
    </>
  );
}
