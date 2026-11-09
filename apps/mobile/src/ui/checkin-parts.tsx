import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import type { Checkin, PhotoAngleKey } from '@pt/api-client';
import { formatDateTime, formatValue } from '@/features/work';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { askPhotoSource, pickPhoto, PhotoPermissionError, uploadPhoto } from '@/lib/photo';
import { usePrefs } from '@/stores/prefs';
import { SecureImage } from './secure-image';
import { AppText, Banner, Button, Card, TextField } from './kit';

/** Measurements a check-in holds, with their unit; empty when nothing was entered. */
export function MeasurementList({ checkin }: { checkin: Checkin }) {
  const t = useT();
  const locale = usePrefs((s) => s.locale);
  if (checkin.measurements.length === 0) return null;
  return (
    <View style={{ gap: 4 }}>
      {checkin.measurements.map((m) => (
        <AppText key={m.key} variant="body">{t(`fitness.metric.${m.key}`)}: {formatValue(m.value, 1, locale)}{m.unit ? ` ${m.unit}` : ''}</AppText>
      ))}
    </View>
  );
}

/** The two adherence figures the server worked out for the week (null = nothing was scheduled). */
export function AdherenceLine({ workoutPct, nutritionPct }: { workoutPct: number | null; nutritionPct: number | null }) {
  const t = useT();
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="muted">{t('checkin.workoutAdherence')}: {workoutPct === null ? '—' : `${workoutPct}%`}</AppText>
      <AppText variant="muted">{t('checkin.nutritionAdherence')}: {nutritionPct === null ? '—' : `${nutritionPct}%`}</AppText>
    </View>
  );
}

/** Photos of a check-in. Hidden ones are not listed at all: the server decided the caller may not see them. */
export function PhotoStrip({ checkin }: { checkin: Checkin }) {
  const t = useT();
  if (checkin.photosHidden) return <AppText variant="muted">{t('checkin.photosHiddenNote')}</AppText>;
  if (checkin.photos.length === 0) return <AppText variant="muted">{t('checkin.noPhotos')}</AppText>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {checkin.photos.map((p) => (
        <View key={p.id} style={{ gap: 4 }}>
          <SecureImage fileId={p.fileId} label={t(`checkin.angle.${p.angle}`)} size={100} />
          <AppText variant="muted">{t(`checkin.angle.${p.angle}`)}</AppText>
        </View>
      ))}
    </View>
  );
}

/** Trainer feedback, the discussion thread, and the box to add to it. */
export function Thread({ checkin, queryKey }: { checkin: Checkin; queryKey: readonly unknown[] }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const locale = usePrefs((s) => s.locale);
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const [text, setText] = useState('');
  const post = useMutation({
    mutationFn: (body: string) => api.org(orgId).fitness.checkins.comment(checkin.id, body),
    onSuccess: () => { setText(''); void qc.invalidateQueries({ queryKey }); },
  });
  return (
    <Card>
      <AppText variant="heading">{t('checkin.comments')}</AppText>
      {checkin.feedback ? (
        <View style={{ gap: 2 }}>
          <AppText variant="label">{t('checkin.feedback')}{checkin.reviewedByName ? ` · ${t('checkin.reviewedBy', { name: checkin.reviewedByName })}` : ''}</AppText>
          <AppText>{checkin.feedback}</AppText>
        </View>
      ) : null}
      {checkin.comments.length === 0 ? <AppText variant="muted">{t('checkin.noComments')}</AppText> : null}
      {checkin.comments.map((c) => (
        <View key={c.id} style={{ gap: 2 }}>
          <AppText variant="label">{c.authorName} · {formatDateTime(c.createdAt, locale)}</AppText>
          <AppText>{c.body}</AppText>
        </View>
      ))}
      {post.isError ? <Banner>{errorMessage(post.error)}</Banner> : null}
      <TextField label={t('checkin.commentLabel')} placeholder={t('checkin.commentPlaceholder')} value={text} onChangeText={setText} multiline maxLength={2000} style={{ minHeight: 72, paddingTop: 12 }} />
      <Button title={t('checkin.post')} loading={post.isPending} disabled={text.trim().length === 0} onPress={() => post.mutate(text.trim())} />
    </Card>
  );
}

const ANGLES: PhotoAngleKey[] = ['FRONT', 'SIDE', 'BACK'];

/**
 * The three weekly photo slots of a draft check-in. A photo is picked (camera or library), re-encoded on the phone, uploaded
 * as a private file, and attached; the draft is created first when this is the first thing the client does this week.
 */
export function PhotoSlots({ week, checkin }: { week: 'current' | 'previous'; checkin: Checkin | null }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const done = () => qc.invalidateQueries({ queryKey: ['org', orgId, 'fitness', 'checkin-week'] });
  const add = useMutation({
    mutationFn: async (angle: PhotoAngleKey) => {
      const source = await askPhotoSource(t);
      if (!source) return;
      const photo = await pickPhoto(source);
      if (!photo) return;
      const draft = checkin ?? (await api.org(orgId).fitness.checkins.saveWeek(week, {}));
      const stored = await uploadPhoto(orgId, photo, { sensitive: true });
      await api.org(orgId).fitness.photos.add({ fileId: stored.id, angle, kind: 'WEEKLY', checkinId: draft.id });
    },
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (photoId: string) => api.org(orgId).fitness.photos.remove(photoId), onSuccess: done });
  const error = add.error ?? remove.error;

  return (
    <View style={{ gap: 12 }}>
      {error ? <Banner>{error instanceof PhotoPermissionError ? t('checkin.photoPermission') : errorMessage(error)}</Banner> : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {ANGLES.map((angle) => {
          const existing = checkin?.photos.find((p) => p.angle === angle);
          const busy = add.isPending && add.variables === angle;
          return (
            <View key={angle} style={{ flex: 1, gap: 6 }}>
              <AppText variant="label">{t(`checkin.angle.${angle}`)}</AppText>
              {existing ? <SecureImage fileId={existing.fileId} label={t(`checkin.angle.${angle}`)} size={90} /> : null}
              <Button title={existing ? t('checkin.replace') : t('checkin.add')} variant="secondary" loading={busy} disabled={add.isPending || remove.isPending} onPress={() => add.mutate(angle)} />
              {existing ? <Button title={t('checkin.removePhoto')} variant="danger" disabled={add.isPending || remove.isPending} onPress={() => remove.mutate(existing.id)} /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
