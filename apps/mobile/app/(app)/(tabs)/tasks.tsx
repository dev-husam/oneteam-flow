import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isOverdue } from '@pt/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { formatDate } from '@/features/work';
import { useOrgContext } from '@/features/org';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Button, Row } from '@/ui/kit';
import { useColors } from '@/ui/theme';

/** Tasks the signed-in person may see. Tapping the circle finishes (or reopens) their own part of a task. */
export default function Tasks() {
  const t = useT();
  const c = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const locale = usePrefs((s) => s.locale);
  const { can } = useOrgContext();
  const [mine, setMine] = useState(false);

  const list = useInfiniteQuery({
    queryKey: ['org', orgId, 'tasks', 'list', mine],
    queryFn: ({ pageParam }) => api.org(orgId).tasks.list({ assignee: mine ? 'me' : undefined, cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api.org(orgId).tasks.setStatus(id, done ? 'PENDING' : 'DONE'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org', orgId, 'tasks'] }),
  });

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      data={items}
      keyExtractor={(x) => x.id}
      refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button title={t('tasks.assignedToMe')} variant={mine ? 'primary' : 'secondary'} onPress={() => setMine((v) => !v)} accessibilityState={{ selected: mine }} /></View>
          </View>
          {list.isError ? <Banner>{errorMessage(list.error)}</Banner> : null}
          {toggle.isError ? <Banner>{errorMessage(toggle.error)}</Banner> : null}
        </View>
      }
      ListEmptyComponent={list.isPending ? <ActivityIndicator color={c.accent} /> : <AppText variant="muted">{t('tasks.empty')}</AppText>}
      ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={c.accent} /> : undefined}
      renderItem={({ item }) => {
        const late = isOverdue(item.dueAt, item.status);
        const done = item.assignees.filter((a) => a.status === 'DONE').length;
        const canToggle = item.myStatus !== null && item.status !== 'CANCELLED' && can('task.update_status');
        const bits = [
          t(`tasks.status.${item.status}`),
          t(`tasks.priority.${item.priority}`),
          item.dueAt ? `${late ? `${t('tasks.overdue')}: ` : ''}${t('tasks.dueOn', { date: formatDate(item.dueAt, locale) })}` : null,
          item.assignees.length > 0 ? t('tasks.progressOf', { done, total: item.assignees.length }) : null,
        ].filter(Boolean);
        return (
          <Row
            title={item.title}
            subtitle={bits.join(' · ')}
            onPress={() => router.push(`/(app)/task/${item.id}`)}
            right={
              canToggle ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.myStatus === 'DONE', busy: toggle.isPending }}
                  accessibilityLabel={t(`tasks.myStatus.${item.myStatus === 'DONE' ? 'PENDING' : 'DONE'}`)}
                  hitSlop={10}
                  onPress={() => toggle.mutate({ id: item.id, done: item.myStatus === 'DONE' })}
                  style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: item.myStatus === 'DONE' ? c.ok : c.line, backgroundColor: item.myStatus === 'DONE' ? c.ok : 'transparent' }}
                />
              ) : undefined
            }
          />
        );
      }}
    />
  );
}
