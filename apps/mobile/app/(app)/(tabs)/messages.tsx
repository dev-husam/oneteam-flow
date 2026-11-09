import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { formatShortDate } from '@/features/work';
import { messagingKey } from '@/features/messaging';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Button, Row } from '@/ui/kit';
import { useColors } from '@/ui/theme';

/** The person's private conversations, most recent first. */
export default function Messages() {
  const t = useT();
  const c = useColors();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const locale = usePrefs((s) => s.locale);
  const list = useQuery({ queryKey: messagingKey(orgId, 'conversations'), queryFn: () => api.org(orgId).messaging.conversations.list() });

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      data={list.data ?? []}
      keyExtractor={(x) => x.id}
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <Button title={t('messaging.newMessage')} onPress={() => router.push('/(app)/new-message')} />
          {list.isError ? <Banner>{errorMessage(list.error)}</Banner> : null}
        </View>
      }
      ListEmptyComponent={
        list.isPending ? (
          <ActivityIndicator color={c.accent} />
        ) : (
          <View style={{ gap: 4 }}>
            <AppText variant="heading">{t('messaging.empty')}</AppText>
            <AppText variant="muted">{t('messaging.emptyBody')}</AppText>
          </View>
        )
      }
      renderItem={({ item }) => {
        const last = item.lastMessage;
        const preview = last ? (last.deleted ? t('messaging.deleted') : last.preview || (last.hasAttachments ? t('messaging.attachments') : '')) : t('messaging.startedBy');
        return (
          <Row
            title={item.other?.fullName ?? '—'}
            subtitle={`${preview}${last ? ` · ${formatShortDate(last.createdAt, locale)}` : ''}`}
            onPress={() => router.push(`/(app)/conversation/${item.id}`)}
            right={item.unreadCount > 0 ? <AppText variant="label" accessibilityLabel={t('messaging.unread', { count: item.unreadCount })} style={{ color: c.link }}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</AppText> : undefined}
          />
        );
      }}
    />
  );
}
