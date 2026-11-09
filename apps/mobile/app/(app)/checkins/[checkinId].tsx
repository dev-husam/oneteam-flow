import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { formatDate, formatDateTime } from '@/features/work';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { AdherenceLine, MeasurementList, PhotoStrip, Thread } from '@/ui/checkin-parts';
import { AppText, Banner, Button, Card, Screen, TextField } from '@/ui/kit';

/** One check-in for the trainer: numbers, photos (shown on request: each view is audited), discussion, review. */
export default function CheckinDetail() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { checkinId } = useLocalSearchParams<{ checkinId: string }>();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const locale = usePrefs((s) => s.locale);
  const key = ['org', orgId, 'fitness', 'checkin', checkinId] as const;
  const q = useQuery({ queryKey: key, queryFn: () => api.org(orgId).fitness.checkins.get(checkinId!) });
  const [feedback, setFeedback] = useState('');
  const [photos, setPhotos] = useState(false);
  const review = useMutation({
    mutationFn: () => api.org(orgId).fitness.checkins.review(checkinId!, feedback.trim() || undefined),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ['org', orgId, 'fitness', 'checkins'] }); },
  });
  const c = q.data;

  return (
    <Screen>
      {q.isPending ? <ActivityIndicator /> : null}
      {q.isError ? <Banner>{errorMessage(q.error)}</Banner> : null}
      {review.isError ? <Banner>{errorMessage(review.error)}</Banner> : null}
      {review.isSuccess ? <Banner tone="ok">{t('checkin.reviewedToast')}</Banner> : null}
      {c ? (
        <>
          <AppText variant="title">{c.clientName}</AppText>
          <AppText variant="muted">{t('checkin.weekOf', { date: formatDate(`${c.week.start}T00:00:00`, locale) })} · {t(`checkin.status.${c.status}`)}</AppText>
          <Card>
            <MeasurementList checkin={c} />
            <AdherenceLine workoutPct={c.adherence.workoutPct} nutritionPct={c.adherence.nutritionPct} />
            {c.clientNotes ? <AppText>{c.clientNotes}</AppText> : null}
            {c.submittedAt ? <AppText variant="muted">{t('checkin.submittedOn', { date: formatDateTime(c.submittedAt, locale) })}</AppText> : null}
          </Card>
          <Card>
            <AppText variant="heading">{t('checkin.photos')}</AppText>
            {c.photosHidden || c.photos.length === 0 || photos ? <PhotoStrip checkin={c} /> : (
              <>
                <AppText variant="muted">{t('checkin.photosOnRequest')}</AppText>
                <Button title={t('checkin.showPhotos')} variant="secondary" onPress={() => setPhotos(true)} />
              </>
            )}
          </Card>
          <Thread checkin={c} queryKey={key} />
          {c.status === 'SUBMITTED' ? (
            <Card>
              <AppText variant="heading">{t('checkin.review')}</AppText>
              <TextField label={t('checkin.feedback')} placeholder={t('checkin.feedbackPlaceholder')} value={feedback} onChangeText={setFeedback} multiline maxLength={2000} style={{ minHeight: 88, paddingTop: 12 }} />
              <Button title={t('checkin.markReviewed')} loading={review.isPending} onPress={() => review.mutate()} />
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
