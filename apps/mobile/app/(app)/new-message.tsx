import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { messagingKey } from '@/features/messaging';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Row, TextField } from '@/ui/kit';
import { useColors } from '@/ui/theme';

/** Pick the person to write to: only people the server says the caller may start a conversation with. */
export default function NewMessage() {
  const t = useT();
  const c = useColors();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim(), 250);
  const list = useInfiniteQuery({
    queryKey: messagingKey(orgId, 'contacts', search),
    queryFn: ({ pageParam }) => api.org(orgId).messaging.contacts({ q: search || undefined, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const people = list.data?.pages.flatMap((p) => p.data) ?? [];
  const start = useMutation({
    mutationFn: (membershipId: string) => api.org(orgId).messaging.conversations.start(membershipId),
    onSuccess: (conversation) => router.replace(`/(app)/conversation/${conversation.id}`),
  });

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      keyboardShouldPersistTaps="handled"
      data={people}
      keyExtractor={(x) => x.membershipId}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <TextField label={t('messaging.searchPeople')} placeholder={t('messaging.searchPlaceholder')} value={q} onChangeText={setQ} autoCorrect={false} />
          {list.isError ? <Banner>{errorMessage(list.error)}</Banner> : null}
          {start.isError ? <Banner>{errorMessage(start.error)}</Banner> : null}
        </View>
      }
      ListEmptyComponent={
        list.isPending ? (
          <ActivityIndicator color={c.accent} />
        ) : (
          <View style={{ gap: 4 }}>
            <AppText variant="heading">{t('messaging.noContacts')}</AppText>
            <AppText variant="muted">{t('messaging.noContactsBody')}</AppText>
          </View>
        )
      }
      ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={c.accent} /> : undefined}
      renderItem={({ item }) => <Row title={item.fullName} onPress={() => !start.isPending && start.mutate(item.membershipId)} />}
    />
  );
}
