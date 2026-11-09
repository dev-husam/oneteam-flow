'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Checkin, CheckinMetricKey, CheckinWeek, PhotoAngleKey, PhotoKindKey, ProgressPhoto } from '@pt/api-client';
import { CHECKIN_METRIC_KEYS, CHECKIN_METRIC_RANGES, PHOTO_ANGLES } from '@pt/domain';
import { Camera, ClipboardCheck, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { CheckinThread } from './checkin-detail';
import { SecureImage } from './secure-image';
import { isPhotoType, uploadImage } from './upload-image';

const UNIT: Record<CheckinMetricKey, string> = { weight_kg: 'kg', body_fat_pct: '%', waist_cm: 'cm', hips_cm: 'cm', chest_cm: 'cm', arm_cm: 'cm', thigh_cm: 'cm' };

/** Three photo positions. Each can be replaced or removed until the check-in is submitted. */
function PhotoSlots({ kind, checkinId, photos, ensureDraft, onChanged, readOnly }: { kind: PhotoKindKey; checkinId?: string; photos: { id: string; fileId: string; angle: PhotoAngleKey }[]; ensureDraft?: () => Promise<string>; onChanged: () => void; readOnly?: boolean }) {
  const t = useTranslations('checkin');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { orgId } = useOrg();
  const inputs = useRef<Partial<Record<PhotoAngleKey, HTMLInputElement | null>>>({});
  const [busy, setBusy] = useState<PhotoAngleKey | null>(null);

  const upload = async (angle: PhotoAngleKey, file: File) => {
    if (!isPhotoType(file.type)) { toast(t('photoFormat'), 'error'); return; }
    setBusy(angle);
    try {
      const id = kind === 'WEEKLY' ? await ensureDraft!() : undefined;
      const stored = await uploadImage(orgId, file, { sensitive: true });
      await api.org(orgId).fitness.photos.add({ fileId: stored.id, angle, kind, checkinId: id ?? checkinId });
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  const remove = useMutation({ mutationFn: (id: string) => api.org(orgId).fitness.photos.remove(id), onSuccess: onChanged, onError: (e) => toast(errorMessage(e), 'error') });

  return (
    <div className="grid grid-cols-3 gap-3">
      {PHOTO_ANGLES.map((angle) => {
        const photo = photos.find((p) => p.angle === angle);
        return (
          <div key={angle} className="space-y-2">
            <p className="text-xs font-medium text-ink-2">{t(`angle.${angle}`)}</p>
            {photo ? <SecureImage fileId={photo.fileId} alt={t(`angle.${angle}`)} /> : <div className="grid aspect-[3/4] w-full place-items-center rounded-md border border-dashed border-line text-muted"><Camera className="size-6" aria-hidden /></div>}
            {!readOnly && (
              <div className="flex gap-1">
                <input ref={(el) => { inputs.current[angle] = el; }} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(angle, f); }} />
                <Button size="sm" variant="secondary" className="flex-1" loading={busy === angle} onClick={() => inputs.current[angle]?.click()}>{photo ? t('replace') : t('add')}</Button>
                {photo && <Button size="icon" variant="ghost" aria-label={t('removePhoto')} onClick={() => remove.mutate(photo.id)}><Trash2 className="size-4" aria-hidden /></Button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Submitted({ checkin }: { checkin: Checkin }) {
  const t = useTranslations('checkin');
  return (
    <div className="space-y-6">
      <CheckinThread checkin={checkin} canComment />
      {checkin.status === 'SUBMITTED' && <p className="text-sm text-muted">{t('waitingReview')}</p>}
    </div>
  );
}

/** The client's weekly check-in: measurements, photos, notes, and a preview of how the week went. */
export function CheckinPage() {
  const t = useTranslations('checkin');
  const f = useTranslations('fitness');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, membershipId } = useOrg();
  const [which, setWhich] = useState<'current' | 'previous'>('current');
  const week = useQuery({ queryKey: orgKey(orgId, 'fitness', 'checkin', which), queryFn: () => api.org(orgId).fitness.checkins.week(which) });
  const starting = useQuery({ queryKey: orgKey(orgId, 'fitness', 'photos', membershipId), queryFn: () => api.org(orgId).fitness.photos.forClient(membershipId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness') });

  // form state is seeded from the saved draft once (the component is keyed by week and draft id below)
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={
        <div role="group" aria-label={t('weekPicker')} className="flex gap-1">
          {(['current', 'previous'] as const).map((w) => <Button key={w} size="sm" variant={which === w ? 'primary' : 'secondary'} aria-pressed={which === w} onClick={() => setWhich(w)}>{t(`week.${w}`)}</Button>)}
        </div>
      } />
      {week.isPending && <Skeleton className="h-64" />}
      {week.isError && <ErrorAlert error={week.error} />}
      {week.data && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-2">
            <span>{format.dateTime(new Date(`${week.data.week.start}T00:00:00`), { dateStyle: 'medium' })} – {format.dateTime(new Date(`${week.data.week.end}T00:00:00`), { dateStyle: 'medium' })}</span>
            {week.data.state === 'DUE' && <Badge tone="warn">{t('state.DUE')}</Badge>}
            {week.data.state === 'OVERDUE' && <Badge tone="danger">{t('state.OVERDUE')}</Badge>}
            {week.data.checkin && week.data.checkin.status !== 'DRAFT' && <Badge tone="ok">{t(`status.${week.data.checkin.status}`)}</Badge>}
          </div>
          {week.data.checkin && week.data.checkin.status !== 'DRAFT'
            ? <Submitted checkin={week.data.checkin} />
            : <CheckinForm key={`${which}:${week.data.checkin?.id ?? 'new'}`} which={which} week={week.data} onChanged={() => void refresh()} onError={(e) => toast(errorMessage(e), 'error')} />}
          <Card className="anim-rise">
            <CardHeader><CardTitle>{t('startingPhotos')}</CardTitle><p className="text-sm text-muted">{t('startingPhotosHint')}</p></CardHeader>
            <CardBody><PhotoSlots kind="STARTING" photos={(starting.data ?? []).filter((p: ProgressPhoto) => p.kind === 'STARTING')} onChanged={() => void refresh()} /></CardBody>
          </Card>
        </div>
      )}
      <p className="mt-6 text-xs text-muted">{f('profile.ownHint')}</p>
    </>
  );
}

function CheckinForm({ which, week, onChanged, onError }: { which: 'current' | 'previous'; week: CheckinWeek; onChanged: () => void; onError: (e: unknown) => void }) {
  const t = useTranslations('checkin');
  const f = useTranslations('fitness');
  const toast = useToast();
  const { orgId } = useOrg();
  const draft = week.checkin;
  const initial = Object.fromEntries(CHECKIN_METRIC_KEYS.map((k) => [k, String(draft?.measurements.find((m) => m.key === k)?.value ?? '')])) as Record<CheckinMetricKey, string>;
  const [values, setValues] = useState(initial);
  const [notes, setNotes] = useState(draft?.clientNotes ?? '');
  const [error, setError] = useState<string | null>(null);

  const body = () => {
    const measurements: Partial<Record<CheckinMetricKey, number | null>> = {};
    for (const k of CHECKIN_METRIC_KEYS) measurements[k] = values[k].trim() === '' ? null : Number(values[k]);
    return { clientNotes: notes.trim() || null, measurements };
  };
  const invalid = CHECKIN_METRIC_KEYS.find((k) => {
    if (values[k].trim() === '') return false;
    const v = Number(values[k]);
    const [min, max] = CHECKIN_METRIC_RANGES[k];
    return !Number.isFinite(v) || v < min || v > max || Math.round(v * 10) / 10 !== v;
  });
  const save = async (): Promise<Checkin> => api.org(orgId).fitness.checkins.saveWeek(which, body());
  const saveDraft = useMutation({ mutationFn: save, onSuccess: () => { onChanged(); toast(t('draftSaved')); }, onError });
  const submit = useMutation({
    mutationFn: async () => { const c = await save(); return api.org(orgId).fitness.checkins.submit(c.id); },
    onSuccess: () => { onChanged(); toast(t('submitted')); },
    onError: (e) => { onError(e); setError(null); },
  });
  const hasAnything = CHECKIN_METRIC_KEYS.some((k) => values[k].trim() !== '') || (draft?.photos.length ?? 0) > 0;

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); if (!invalid && hasAnything) submit.mutate(); }}>
      <Card className="anim-rise">
        <CardHeader><CardTitle>{t('measurements')}</CardTitle><p className="text-sm text-muted">{t('measurementsHint')}</p></CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKIN_METRIC_KEYS.map((k) => {
            const last = week.lastMeasurements[k];
            return (
              <Field key={k} label={`${f(`metric.${k}`)} (${UNIT[k]})`} hint={last ? t('lastValue', { value: last.value }) : undefined} optionalLabel={k === 'weight_kg' ? undefined : f('optional')} error={invalid === k ? t('invalidValue') : undefined}>
                {(c) => <Input {...c} type="number" inputMode="decimal" step="0.1" value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />}
              </Field>
            );
          })}
        </CardBody>
      </Card>

      <Card className="anim-rise">
        <CardHeader><CardTitle>{t('photos')}</CardTitle><p className="text-sm text-muted">{t('photosHint')}</p></CardHeader>
        <CardBody><PhotoSlots kind="WEEKLY" checkinId={draft?.id} photos={draft?.photos ?? []} ensureDraft={async () => (await save()).id} onChanged={onChanged} /></CardBody>
      </Card>

      <Card className="anim-rise">
        <CardHeader><CardTitle>{t('howWasWeek')}</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <dl className="grid grid-cols-2 gap-4">
            <div><dt className="text-xs text-muted">{t('workoutAdherence')}</dt><dd className="text-lg font-semibold tabular-nums">{week.preview.workout.pct === null ? '—' : `${week.preview.workout.pct}%`}</dd><dd className="text-xs text-muted">{t('workoutsOf', { done: week.preview.workout.completed, total: week.preview.workout.scheduled })}</dd></div>
            <div><dt className="text-xs text-muted">{t('nutritionAdherence')}</dt><dd className="text-lg font-semibold tabular-nums">{week.preview.nutrition.pct === null ? '—' : `${week.preview.nutrition.pct}%`}</dd><dd className="text-xs text-muted">{t('mealsOf', { logged: week.preview.nutrition.logged, total: week.preview.nutrition.planned })}</dd></div>
          </dl>
          <Field label={t('notes')} optionalLabel={f('optional')}>{(c) => <Textarea {...c} rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('notesPlaceholder')} />}</Field>
        </CardBody>
      </Card>

      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted">{t('submitHint')}</p>
        <span className="ms-auto flex gap-2">
          <Button type="button" variant="secondary" loading={saveDraft.isPending} disabled={Boolean(invalid)} onClick={() => saveDraft.mutate()}>{t('saveDraft')}</Button>
          <Button type="submit" loading={submit.isPending} disabled={Boolean(invalid) || !hasAnything}><ClipboardCheck className="size-4" aria-hidden />{t('submit')}</Button>
        </span>
      </div>
    </form>
  );
}
