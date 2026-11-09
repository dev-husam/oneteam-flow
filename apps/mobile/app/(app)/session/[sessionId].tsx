import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionDetail, SessionExercise } from '@pt/api-client';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { exerciseName, formatDate } from '@/features/work';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Button, Card, Screen, TextField } from '@/ui/kit';

function SetRow({ session, ex, setNo, onSession }: { session: SessionDetail; ex: SessionExercise; setNo: number; onSession: (s: SessionDetail) => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const logged = ex.logged.find((l) => l.setNo === setNo);
  const before = ex.previous?.sets.find((s) => s.setNo === setNo);
  // Start from what is logged, else what was done last time, else the target.
  const [reps, setReps] = useState(logged ? String(logged.repsDone) : before ? String(before.repsDone) : String(ex.repsMax));
  const [weight, setWeight] = useState(logged ? (logged.weightKg === null ? '' : String(logged.weightKg)) : before?.weightKg != null ? String(before.weightKg) : ex.targetWeightKg !== null ? String(ex.targetWeightKg) : '');
  const norm = (v: string) => v.replace(',', '.');
  const changed = !logged || String(logged.repsDone) !== reps || (logged.weightKg === null ? '' : String(logged.weightKg)) !== norm(weight);
  const valid = reps.trim() !== '' && Number.isInteger(Number(reps)) && Number(reps) >= 0 && (weight.trim() === '' || Number(norm(weight)) >= 0);
  const log = useMutation({
    mutationFn: () => api.org(orgId).fitness.sessions.logSet(session.id, { dayExerciseId: ex.dayExerciseId, setNo, repsDone: Number(reps), weightKg: weight.trim() === '' ? null : Number(norm(weight)) }),
    onSuccess: onSession,
  });
  const remove = useMutation({ mutationFn: () => api.org(orgId).fitness.sessions.removeSet(session.id, ex.dayExerciseId, setNo), onSuccess: onSession });

  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label">{t('fitness.session.set')} {setNo}{before ? ` · ${t('fitness.session.previous')}: ${before.repsDone} × ${before.weightKg ?? '—'}` : ''}</AppText>
      {log.isError || remove.isError ? <Banner>{errorMessage(log.error ?? remove.error)}</Banner> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><TextField label={t('fitness.session.repsLabel')} value={reps} onChangeText={setReps} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><TextField label={t('fitness.session.weightLabel')} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button title={logged && !changed ? t('fitness.session.logged') : logged ? t('fitness.session.update') : t('fitness.session.log')} variant={logged && !changed ? 'secondary' : 'primary'} loading={log.isPending} disabled={!valid || !changed} onPress={() => log.mutate()} /></View>
        {logged ? <View style={{ flex: 1 }}><Button title={t('fitness.session.removeSet', { n: setNo })} variant="danger" loading={remove.isPending} onPress={() => remove.mutate()} /></View> : null}
      </View>
    </View>
  );
}

/** Logs a workout set by set. The client edits their own open session; trainers see it read-only. */
export default function SessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const t = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const locale = usePrefs((s) => s.locale);
  const [extra, setExtra] = useState<Record<string, number>>({});
  const [finishing, setFinishing] = useState(false);
  const [rpe, setRpe] = useState<number | undefined>();
  const [notes, setNotes] = useState('');
  const key = ['org', orgId, 'fitness', 'sessions', 'detail', sessionId];
  const query = useQuery({ queryKey: key, queryFn: () => api.org(orgId).fitness.sessions.get(sessionId) });
  const update = (s: SessionDetail) => queryClient.setQueryData(key, s);
  const finish = useMutation({
    mutationFn: () => api.org(orgId).fitness.sessions.complete(sessionId, { rpe, notes: notes.trim() || undefined }),
    onSuccess: async (s) => { update(s); await queryClient.invalidateQueries({ queryKey: ['org', orgId, 'fitness'] }); router.back(); },
  });

  if (query.isPending) return <Screen><ActivityIndicator /></Screen>;
  if (query.isError) return <Screen><Banner>{errorMessage(query.error)}</Banner></Screen>;
  const s = query.data;
  const total = s.exercises.reduce((n, e) => n + e.logged.length, 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: s.dayName }} />
      <View style={{ gap: 4 }}>
        <AppText variant="title">{s.dayName}</AppText>
        <AppText variant="muted">{s.planName} · {formatDate(`${s.scheduledDate}T00:00:00`, locale)}{s.editable ? '' : ` · ${s.clientName}`}</AppText>
        {s.completedAt ? <AppText variant="label">{t('fitness.workouts.completed')} · {t('fitness.session.volumeLabel')}: {Math.round(s.volume)} kg · {t('fitness.session.rpe')}: {s.rpe ?? '—'}</AppText> : null}
        {s.notes ? <AppText>{s.notes}</AppText> : null}
      </View>

      {s.exercises.map((ex) => {
        const count = Math.max(ex.sets, ...ex.logged.map((l) => l.setNo), 0) + (extra[ex.dayExerciseId] ?? 0);
        return (
          <Card key={ex.dayExerciseId}>
            <AppText variant="heading">{exerciseName(ex.exercise, locale)}</AppText>
            <AppText variant="muted">{t('fitness.plans.setsReps', { sets: ex.sets, min: ex.repsMin, max: ex.repsMax })}{ex.targetWeightKg !== null ? ` · ${ex.targetWeightKg} kg` : ''} · {t('fitness.plans.restShort', { seconds: ex.restSeconds })}</AppText>
            {ex.notes ? <AppText variant="muted">{ex.notes}</AppText> : null}
            {s.editable ? (
              <>
                {Array.from({ length: count }, (_, i) => <SetRow key={i + 1} session={s} ex={ex} setNo={i + 1} onSession={update} />)}
                <Button title={t('fitness.session.addSet')} variant="secondary" onPress={() => setExtra({ ...extra, [ex.dayExerciseId]: (extra[ex.dayExerciseId] ?? 0) + 1 })} />
              </>
            ) : ex.logged.length === 0 ? (
              <AppText variant="muted">{t('fitness.session.nothingLogged')}</AppText>
            ) : (
              ex.logged.map((l) => <AppText key={l.setNo}>{t('fitness.session.setLine', { n: l.setNo, reps: l.repsDone, weight: l.weightKg ?? '—' })}</AppText>)
            )}
          </Card>
        );
      })}

      {s.editable ? (
        finishing ? (
          <Card>
            <AppText variant="heading">{t('fitness.session.finishTitle')}</AppText>
            <AppText variant="muted">{t('fitness.session.finishBody')}</AppText>
            {finish.isError ? <Banner>{errorMessage(finish.error)}</Banner> : null}
            <AppText variant="label">{t('fitness.session.rpe')}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <View key={n} style={{ width: '18%' }}><Button title={String(n)} variant={rpe === n ? 'primary' : 'secondary'} onPress={() => setRpe(rpe === n ? undefined : n)} accessibilityState={{ selected: rpe === n }} /></View>)}
            </View>
            <TextField label={t('fitness.session.notes')} value={notes} onChangeText={setNotes} multiline maxLength={1000} style={{ minHeight: 70, textAlignVertical: 'top', paddingTop: 12 }} />
            <Button title={t('fitness.session.finish')} loading={finish.isPending} onPress={() => finish.mutate()} />
            <Button title={t('common.cancel')} variant="secondary" onPress={() => setFinishing(false)} />
          </Card>
        ) : (
          <Button title={t('fitness.session.finish')} disabled={total === 0} onPress={() => setFinishing(true)} />
        )
      ) : null}
    </Screen>
  );
}
