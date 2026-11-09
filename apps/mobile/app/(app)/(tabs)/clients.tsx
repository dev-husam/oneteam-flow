import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { formatDate } from '@/features/work';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Row, TextField } from '@/ui/kit';
import { useColors } from '@/ui/theme';

/** The clients the signed-in staff member looks after (the server filters by their reach). */
export default function Clients() {
  const t = useT();
  const c = useColors();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const locale = usePrefs((s) => s.locale);
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const list = useInfiniteQuery({
    queryKey: ['org', orgId, 'fitness', 'clients', search],
    queryFn: ({ pageParam }) => api.org(orgId).fitness.clients.list({ q: search || undefined, cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      data={items}
      keyExtractor={(x) => x.membershipId}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <TextField label={t('fitness.clients.search')} value={q} onChangeText={setQ} placeholder={t('fitness.clients.searchPlaceholder')} autoCapitalize="none" />
          {list.isError ? <Banner>{errorMessage(list.error)}</Banner> : null}
        </View>
      }
      ListEmptyComponent={list.isPending ? <ActivityIndicator color={c.accent} /> : <AppText variant="muted">{q ? t('fitness.clients.noResults') : t('fitness.clients.empty')}</AppText>}
      renderItem={({ item }) => (
        <Row
          title={item.fullName}
          subtitle={`${item.goalType ? t(`fitness.goal.${item.goalType}`) : '—'} · ${item.activePlans.length ? item.activePlans.map((p) => p.planName).join(', ') : t('fitness.clients.noPlan')} · ${item.lastSessionAt ? formatDate(item.lastSessionAt, locale) : t('fitness.clients.never')}`}
          onPress={() => router.push(`/(app)/client/${item.membershipId}`)}
        />
      )}
    />
  );
}
