import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { formatShortDate, formatValue } from '@/features/work';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Button, Card, Row, Screen } from '@/ui/kit';

/** Staff queue: the weekly check-ins of the clients the caller looks after, newest first. */
export default function Checkins() {
  const t = useT();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const locale = usePrefs((s) => s.locale);
  const [toReview, setToReview] = useState(true);
  const q = useInfiniteQuery({
    queryKey: ['org', orgId, 'fitness', 'checkins', toReview ? 'SUBMITTED' : 'all'],
    queryFn: ({ pageParam }) => api.org(orgId).fitness.checkins.list({ status: toReview ? 'SUBMITTED' : undefined, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <AppText variant="title">{t('checkin.queueTitle')}</AppText>
        <AppText variant="muted">{t('checkin.queueSubtitle')}</AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button title={t('checkin.toReview')} variant={toReview ? 'primary' : 'secondary'} onPress={() => setToReview(true)} /></View>
        <View style={{ flex: 1 }}><Button title={t('checkin.allStatuses')} variant={toReview ? 'secondary' : 'primary'} onPress={() => setToReview(false)} /></View>
      </View>
      {q.isError ? <Banner>{errorMessage(q.error)}</Banner> : null}
      {q.isPending ? <ActivityIndicator /> : null}
      {!q.isPending && rows.length === 0 ? (
        <Card>
          <AppText variant="heading">{t('checkin.queueEmpty')}</AppText>
          <AppText variant="muted">{t('checkin.queueEmptyBody')}</AppText>
        </Card>
      ) : null}
      <View>
        {rows.map((c) => (
          <Row
            key={c.id}
            title={c.clientName}
            subtitle={[
              t('checkin.weekOf', { date: formatShortDate(`${c.weekStart}T00:00:00`, locale) }),
              t(`checkin.status.${c.status}`),
              c.weightKg !== null ? `${formatValue(c.weightKg, 1, locale)} kg` : null,
            ].filter(Boolean).join(' · ')}
            onPress={() => router.push(`/(app)/checkins/${c.id}`)}
          />
        ))}
        {q.hasNextPage ? <Button title={t('common.loadMore')} variant="secondary" loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} /> : null}
      </View>
    </Screen>
  );
}
