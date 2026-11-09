import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { CheckinMetricKey } from '@pt/api-client';
import { CHECKIN_METRIC_KEYS, CHECKIN_METRIC_RANGES } from '@pt/domain';
import { formatDate, formatValue } from '@/features/work';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { AdherenceLine, MeasurementList, PhotoSlots, PhotoStrip, Thread } from '@/ui/checkin-parts';
import { AppText, Banner, Button, Card, Screen, TextField } from '@/ui/kit';

type Week = 'current' | 'previous';

/** Parses what was typed ("88,4" or "88.4"); null = empty, NaN = not a usable number. */
function parseValue(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (s === '') return null;
  return /^\d{1,3}(\.\d)?$/.test(s) ? Number(s) : Number.NaN;
}

/** The client's weekly check-in: this week or last week, as a form until it is submitted, then read-only. */
export default function MyCheckin() {
  const t = useT();
  const [week, setWeek] = useState<Week>('current');
  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <AppText variant="title">{t('checkin.title')}</AppText>
        <AppText variant="muted">{t('checkin.subtitle')}</AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['current', 'previous'] as const).map((w) => (
          <View key={w} style={{ flex: 1 }}><Button title={t(`checkin.week.${w}`)} variant={week === w ? 'primary' : 'secondary'} onPress={() => setWeek(w)} /></View>
        ))}
      </View>
      <WeekView key={week} week={week} />
    </Screen>
  );
}

function WeekView({ week }: { week: Week }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const locale = usePrefs((s) => s.locale);
  const key = ['org', orgId, 'fitness', 'checkin-week', week] as const;
  const q = useQuery({ queryKey: key, queryFn: () => api.org(orgId).fitness.checkins.week(week) });
  const [values, setValues] = useState<Partial<Record<CheckinMetricKey, string>> | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const save = useMutation({
    mutationFn: (input: { submit: boolean }) => {
      const measurements: Partial<Record<CheckinMetricKey, number | null>> = {};
      for (const k of CHECKIN_METRIC_KEYS) measurements[k] = parseValue(form[k] ?? '');
      return api.org(orgId).fitness.checkins.saveWeek(week, { clientNotes: noteValue.trim() || null, measurements }).then((c) => (input.submit ? api.org(orgId).fitness.checkins.submit(c.id) : c));
    },
    onSuccess: () => { setValues(null); setNotes(null); void qc.invalidateQueries({ queryKey: ['org', orgId, 'fitness', 'checkin-week'] }); void qc.invalidateQueries({ queryKey: ['org', orgId, 'fitness', 'nutrition-today'] }); },
  });

  const data = q.data;
  const checkin = data?.checkin ?? null;
  const editable = !checkin || checkin.status === 'DRAFT';
  const saved = Object.fromEntries((checkin?.measurements ?? []).map((m) => [m.key, formatValue(m.value, 1, 'en')])) as Partial<Record<CheckinMetricKey, string>>;
  const form = values ?? saved;
  const noteValue = notes ?? checkin?.clientNotes ?? '';

  const problems = (k: CheckinMetricKey): boolean => {
    const v = parseValue(form[k] ?? '');
    if (v === null) return false;
    const [lo, hi] = CHECKIN_METRIC_RANGES[k];
    return Number.isNaN(v) || v < lo || v > hi;
  };
  const invalid = CHECKIN_METRIC_KEYS.some(problems);
  const weightMissing = parseValue(form.weight_kg ?? '') === null;
  const run = (submit: boolean) => {
    if (invalid || (submit && weightMissing)) { setShowErrors(true); return; }
    save.mutate({ submit });
  };

  if (q.isPending) return <ActivityIndicator />;
  if (q.isError || !data) return <Banner>{errorMessage(q.error)}</Banner>;

  return (
    <>
      <AppText variant="label">{formatDate(`${data.week.start}T00:00:00`, locale)} – {formatDate(`${data.week.end}T00:00:00`, locale)}{checkin ? ` · ${t(`checkin.status.${checkin.status}`)}` : ''}</AppText>
      {save.isError ? <Banner>{errorMessage(save.error)}</Banner> : null}
      {save.isSuccess && !editable ? <Banner tone="ok">{t('checkin.submitted')}</Banner> : null}

      {editable ? (
        <>
          <Card>
            <AppText variant="heading">{t('checkin.measurements')}</AppText>
            <AppText variant="muted">{t('checkin.measurementsHint')}</AppText>
            {CHECKIN_METRIC_KEYS.map((k) => {
              const last = data.lastMeasurements[k];
              return (
                <TextField
                  key={k}
                  label={`${t(`fitness.metric.${k}`)}${k === 'weight_kg' ? '' : ` (${t('common.optional')})`}`}
                  value={form[k] ?? ''}
                  onChangeText={(v) => setValues({ ...form, [k]: v })}
                  keyboardType="decimal-pad"
                  placeholder={last ? t('checkin.lastValue', { value: formatValue(last.value, 1, locale) }) : undefined}
                  error={showErrors && (problems(k) || (k === 'weight_kg' && weightMissing)) ? t('checkin.invalidValue') : undefined}
                />
              );
            })}
          </Card>
          <Card>
            <AppText variant="heading">{t('checkin.howWasWeek')}</AppText>
            <AdherenceLine workoutPct={data.preview.workout.pct} nutritionPct={data.preview.nutrition.pct} />
            <TextField label={t('checkin.notes')} placeholder={t('checkin.notesPlaceholder')} value={noteValue} onChangeText={setNotes} multiline maxLength={2000} style={{ minHeight: 88, paddingTop: 12 }} />
          </Card>
          <AppText variant="muted">{t('checkin.submitHint')}</AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button title={t('checkin.saveDraft')} variant="secondary" disabled={save.isPending} onPress={() => run(false)} /></View>
            <View style={{ flex: 1 }}><Button title={t('checkin.submit')} loading={save.isPending && save.variables?.submit} disabled={save.isPending} onPress={() => run(true)} /></View>
          </View>
          <Card>
            <AppText variant="heading">{t('checkin.photos')}</AppText>
            <AppText variant="muted">{t('checkin.photosHint')}</AppText>
            <PhotoSlots week={week} checkin={checkin} />
          </Card>
        </>
      ) : checkin ? (
        <>
          <Card>
            <MeasurementList checkin={checkin} />
            <AdherenceLine workoutPct={checkin.adherence.workoutPct} nutritionPct={checkin.adherence.nutritionPct} />
            {checkin.clientNotes ? <AppText>{checkin.clientNotes}</AppText> : null}
            {checkin.status === 'SUBMITTED' ? <AppText variant="muted">{t('checkin.waitingReview')}</AppText> : null}
          </Card>
          <Card><AppText variant="heading">{t('checkin.photos')}</AppText><PhotoStrip checkin={checkin} /></Card>
          <Thread checkin={checkin} queryKey={key} />
        </>
      ) : null}
    </>
  );
}
