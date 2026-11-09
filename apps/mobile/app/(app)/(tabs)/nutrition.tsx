import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { MealLogStatusKey } from '@pt/api-client';
import { formatDate, shiftDate } from '@/features/work';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { askPhotoSource, pickPhoto, PhotoPermissionError, uploadPhoto } from '@/lib/photo';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Button, Card, Screen, TextField } from '@/ui/kit';
import { SecureImage } from '@/ui/secure-image';

const STATUSES: MealLogStatusKey[] = ['COMPLETED', 'PARTIAL', 'SKIPPED'];

/** The client's own meals for a day: what the plan says, and a one-tap log of what they actually ate. */
export default function Nutrition() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const locale = usePrefs((s) => s.locale);
  const [date, setDate] = useState<string | undefined>(undefined);
  const key = ['org', orgId, 'fitness', 'nutrition-today', date ?? 'today'];
  const today = useQuery({ queryKey: key, queryFn: () => api.org(orgId).fitness.nutrition.today(date) });
  const log = useMutation({
    mutationFn: (v: { assignmentId: string; mealId: string; status: MealLogStatusKey; notes?: string | null }) =>
      api.org(orgId).fitness.nutrition.logMeal({ ...v, logDate: data?.date }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['org', orgId, 'fitness', 'nutrition-today'] }),
  });
  const data = today.data;
  const isToday = data ? data.date === data.today : true;

  return (
    <Screen>
      {today.isError ? <Banner>{errorMessage(today.error)}</Banner> : null}
      {log.isError ? <Banner>{errorMessage(log.error)}</Banner> : null}
      {today.isPending ? <ActivityIndicator /> : null}
      {data ? (
        <>
          <View style={{ gap: 2 }}>
            <AppText variant="title">{t('nutrition.myTitle')}</AppText>
            <AppText variant="muted">{formatDate(`${data.date}T00:00:00`, locale)}</AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button title={t('nutrition.earlier')} variant="secondary" onPress={() => setDate(shiftDate(data.date, -1))} /></View>
            <View style={{ flex: 1 }}><Button title={t('nutrition.todayButton')} variant="secondary" disabled={isToday} onPress={() => setDate(undefined)} /></View>
            <View style={{ flex: 1 }}><Button title={t('nutrition.later')} variant="secondary" onPress={() => setDate(shiftDate(data.date, 1))} /></View>
          </View>

          {data.items.length === 0 ? (
            <Card>
              <AppText variant="heading">{t('nutrition.nothingPlanned')}</AppText>
              <AppText variant="muted">{t('nutrition.nothingPlannedBody')}</AppText>
            </Card>
          ) : null}
          {data.adherencePct !== null ? <AppText variant="label">{t('nutrition.dayAdherence', { pct: data.adherencePct })}</AppText> : null}

          {data.items.map((item) => (
            <Card key={item.assignmentId}>
              <AppText variant="heading">{item.planName}</AppText>
              {item.dayNotes ? <AppText variant="muted">{item.dayNotes}</AppText> : null}
              {item.meals.length === 0 ? <AppText variant="muted">{t('nutrition.freeDay')}</AppText> : null}
              {item.meals.map((m) => (
                <View key={m.mealId} style={{ gap: 6, paddingTop: 8 }}>
                  <AppText variant="label">{t(`nutrition.mealType.${m.mealType}`)}{m.timeOfDay ? ` · ${m.timeOfDay}` : ''} · {t('nutrition.totalsShort', { kcal: m.totals.calories })}</AppText>
                  {m.items.map((i) => <AppText key={i.id} variant="muted">{[i.name, [i.quantity, i.unit].filter((x) => x !== null && x !== '').join(' ')].filter(Boolean).join(' · ')}</AppText>)}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {STATUSES.map((s) => (
                      <View key={s} style={{ flex: 1 }}>
                        <Button
                          title={t(`nutrition.status.${s}`)}
                          variant={m.log?.status === s ? 'primary' : 'secondary'}
                          accessibilityState={{ selected: m.log?.status === s }}
                          onPress={() => log.mutate({ assignmentId: item.assignmentId, mealId: m.mealId, status: s, notes: m.log?.notes ?? null })}
                        />
                      </View>
                    ))}
                  </View>
                  <MealPhotos assignmentId={item.assignmentId} mealId={m.mealId} date={data.date} log={m.log} />
                  {m.log ? <MealNote key={`${m.mealId}-${m.log.notes ?? ''}`} initial={m.log.notes ?? ''} onSave={(notes) => log.mutate({ assignmentId: item.assignmentId, mealId: m.mealId, status: m.log!.status, notes: notes || null })} /> : null}
                </View>
              ))}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function MealNote({ initial, onSave }: { initial: string; onSave: (notes: string) => void }) {
  const t = useT();
  const [value, setValue] = useState(initial);
  return (
    <TextField
      label={t('nutrition.notes')}
      placeholder={t('nutrition.notesPlaceholder')}
      value={value}
      onChangeText={setValue}
      maxLength={500}
      onEndEditing={() => { if (value !== initial) onSave(value.trim()); }}
    />
  );
}

/** Photos of one meal. Taking the first photo of an unlogged meal logs it as eaten, as on the website. */
function MealPhotos({ assignmentId, mealId, date, log }: { assignmentId: string; mealId: string; date: string; log: { id: string; photoFileIds: string[] } | null }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const done = () => qc.invalidateQueries({ queryKey: ['org', orgId, 'fitness', 'nutrition-today'] });
  const add = useMutation({
    mutationFn: async () => {
      const source = await askPhotoSource(t);
      if (!source) return;
      const photo = await pickPhoto(source);
      if (!photo) return;
      const current = log ?? (await api.org(orgId).fitness.nutrition.logMeal({ assignmentId, mealId, logDate: date, status: 'COMPLETED' }));
      const stored = await uploadPhoto(orgId, photo, { sensitive: false });
      await api.org(orgId).fitness.nutrition.attachMealPhoto(current.id, stored.id);
    },
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (fileId: string) => api.org(orgId).fitness.nutrition.detachMealPhoto(log!.id, fileId), onSuccess: done });
  const error = add.error ?? remove.error;
  const files = log?.photoFileIds ?? [];
  return (
    <View style={{ gap: 6 }}>
      {error ? <Banner>{error instanceof PhotoPermissionError ? t('checkin.photoPermission') : errorMessage(error)}</Banner> : null}
      {files.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {files.map((fileId) => (
            <View key={fileId} style={{ gap: 4 }}>
              <SecureImage fileId={fileId} label={t('nutrition.mealPhoto')} size={80} />
              <Button title={t('nutrition.removePhoto')} variant="danger" disabled={remove.isPending} onPress={() => remove.mutate(fileId)} />
            </View>
          ))}
        </View>
      ) : null}
      <Button title={t('nutrition.addPhoto')} variant="secondary" loading={add.isPending} disabled={remove.isPending} onPress={() => add.mutate()} />
    </View>
  );
}
