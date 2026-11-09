import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { formatDate, formatShortDate } from '@/features/work';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Button, Card, Row, Screen } from '@/ui/kit';

/** The client's own workouts: today, every plan day they may also do, what is coming, and their history. */
export default function Workouts() {
  const t = useT();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const locale = usePrefs((s) => s.locale);
  const today = useQuery({ queryKey: ['org', orgId, 'fitness', 'today'], queryFn: () => api.org(orgId).fitness.workouts.today() });
  const history = useInfiniteQuery({
    queryKey: ['org', orgId, 'fitness', 'sessions', 'mine'],
    queryFn: ({ pageParam }) => api.org(orgId).fitness.sessions.list({ cursor: pageParam, limit: 10 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const start = useMutation({
    mutationFn: (v: { assignmentId: string; dayId: string }) => api.org(orgId).fitness.sessions.start(v),
    onSuccess: (s) => router.push(`/(app)/session/${s.id}`),
  });
  const past = history.data?.pages.flatMap((p) => p.data) ?? [];
  const data = today.data;

  return (
    <Screen>
      {today.isError ? <Banner>{errorMessage(today.error)}</Banner> : null}
      {start.isError ? <Banner>{errorMessage(start.error)}</Banner> : null}
      {today.isPending ? <ActivityIndicator /> : null}
      {data && (
        <>
          <View style={{ gap: 2 }}>
            <AppText variant="title">{t('fitness.workouts.today')}</AppText>
            <AppText variant="muted">{formatDate(`${data.date}T00:00:00`, locale)}</AppText>
          </View>
          {data.today.length === 0 ? (
            <Card>
              <AppText variant="heading">{t('fitness.workouts.nothingToday')}</AppText>
              <AppText variant="muted">{data.assignments.length === 0 ? t('fitness.workouts.noPlanBody') : t('fitness.workouts.restDayBody')}</AppText>
            </Card>
          ) : null}
          {data.today.map((item) => (
            <Card key={`${item.assignmentId}-${item.dayId}`}>
              <AppText variant="heading">{item.dayName}</AppText>
              <AppText variant="muted">{item.planName} · {t('fitness.workouts.exerciseCount', { count: item.exerciseCount })}</AppText>
              {item.session?.completedAt ? (
                <>
                  <AppText variant="label">{t('fitness.workouts.completed')}</AppText>
                  <Button title={t('fitness.workouts.view')} variant="secondary" onPress={() => router.push(`/(app)/session/${item.session!.id}`)} />
                </>
              ) : (
                <Button title={item.session ? t('fitness.workouts.continue') : t('fitness.workouts.start')} loading={start.isPending && start.variables?.dayId === item.dayId} onPress={() => start.mutate({ assignmentId: item.assignmentId, dayId: item.dayId })} />
              )}
            </Card>
          ))}

          {data.assignments.length > 0 ? (
            <Card>
              <AppText variant="heading">{t('fitness.workouts.anyDay')}</AppText>
              <AppText variant="muted">{t('fitness.workouts.anyDayHint')}</AppText>
              {data.assignments.map((a) => (
                <View key={a.assignmentId} style={{ gap: 8 }}>
                  <AppText variant="label">{a.planName}</AppText>
                  {a.days.map((d) => <Button key={d.dayId} title={d.name} variant="secondary" loading={start.isPending && start.variables?.dayId === d.dayId} onPress={() => start.mutate({ assignmentId: a.assignmentId, dayId: d.dayId })} />)}
                </View>
              ))}
            </Card>
          ) : null}

          {data.upcoming.length > 0 ? (
            <Card>
              <AppText variant="heading">{t('fitness.workouts.upcoming')}</AppText>
              {data.upcoming.map((d) => <AppText key={d.date} variant="muted">{formatShortDate(`${d.date}T00:00:00`, locale)} · {d.items.map((i) => i.dayName).join(', ')}</AppText>)}
            </Card>
          ) : null}
        </>
      )}

      <View>
        <AppText variant="heading">{t('fitness.workouts.history')}</AppText>
        {!history.isPending && past.length === 0 ? <AppText variant="muted">{t('fitness.workouts.noHistory')}</AppText> : null}
        {past.map((s) => (
          <Row key={s.id} title={s.dayName} subtitle={`${s.planName} · ${formatDate(`${s.scheduledDate}T00:00:00`, locale)} · ${t('fitness.workouts.setsLogged', { count: s.setCount })} · ${s.completedAt ? t('fitness.workouts.completed') : t('fitness.workouts.inProgress')}`} onPress={() => router.push(`/(app)/session/${s.id}`)} />
        ))}
        {history.hasNextPage ? <Button title={t('common.loadMore')} variant="secondary" loading={history.isFetchingNextPage} onPress={() => void history.fetchNextPage()} /> : null}
      </View>
    </Screen>
  );
}
