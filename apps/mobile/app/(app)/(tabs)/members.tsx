import { useInfiniteQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useErrorMessage, useRoleLabel, useT } from '@/i18n/hooks';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Row, TextField } from '@/ui/kit';
import { useColors } from '@/ui/theme';
import { useDebounced } from '@/lib/use-debounced';

/** Members the signed-in person may see (the server filters by their role: a trainer sees assigned clients). */
export default function Members() {
  const t = useT();
  const c = useColors();
  const roleLabel = useRoleLabel();
  const errorMessage = useErrorMessage();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());

  const list = useInfiniteQuery({
    queryKey: ['org', orgId, 'members', search],
    queryFn: ({ pageParam }) => api.org(orgId).members.list({ q: search || undefined, cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      data={items}
      keyExtractor={(m) => m.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <TextField label={t('members.search')} value={q} onChangeText={setQ} placeholder={t('members.searchPlaceholder')} autoCapitalize="none" />
          {list.isError ? <Banner>{errorMessage(list.error)}</Banner> : null}
        </View>
      }
      ListEmptyComponent={list.isPending ? <ActivityIndicator color={c.accent} /> : <AppText variant="muted">{q ? t('members.noResults') : t('members.empty')}</AppText>}
      ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={c.accent} /> : undefined}
      renderItem={({ item }) => <Row title={item.fullName} subtitle={`${roleLabel(item.role)} · ${t(`status.${item.status}`)}`} />}
    />
  );
}
