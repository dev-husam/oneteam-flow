import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationCategory, NotificationChannel } from '@pt/api-client';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Switch, View } from 'react-native';
import { formatDateTime, notificationRoute } from '@/features/work';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Button, Card, Row, Screen } from '@/ui/kit';

const CHANNELS: NotificationChannel[] = ['IN_APP', 'PUSH', 'EMAIL'];

/** Inbox of the signed-in user (all organizations) and their notification settings. */
export default function Notifications() {
  const t = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const locale = usePrefs((s) => s.locale);

  const list = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) => api.me.notifications.list({ cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const prefs = useQuery({ queryKey: ['notifications', 'preferences'], queryFn: () => api.me.notifications.preferences() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({ mutationFn: (id: string) => api.me.notifications.markRead(id), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => api.me.notifications.markAllRead(), onSuccess: refresh });
  const setPref = useMutation({
    mutationFn: (v: { category: NotificationCategory; channel: NotificationChannel; enabled: boolean }) => api.me.notifications.setPreference(v),
    onSuccess: refresh,
  });

  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const error = list.error ?? prefs.error ?? markRead.error ?? markAll.error ?? setPref.error;

  return (
    <Screen>
      {error ? <Banner>{errorMessage(error)}</Banner> : null}
      <Button title={t('inbox.markAllRead')} variant="secondary" loading={markAll.isPending} onPress={() => markAll.mutate()} />
      {list.isPending ? <ActivityIndicator /> : null}
      {!list.isPending && items.length === 0 ? <><AppText variant="heading">{t('inbox.empty')}</AppText><AppText variant="muted">{t('inbox.emptyBody')}</AppText></> : null}
      <View>
        {items.map((n) => (
          <Row
            key={n.id}
            title={`${n.readAt ? '' : '● '}${n.title}`}
            subtitle={`${n.body}\n${formatDateTime(n.createdAt, locale)}`}
            onPress={() => {
              if (!n.readAt) markRead.mutate(n.id);
              const route = notificationRoute(n);
              if (route) router.push(route as never);
            }}
          />
        ))}
      </View>
      {list.hasNextPage ? <Button title={t('common.loadMore')} variant="secondary" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /> : null}

      <Card>
        <AppText variant="heading">{t('inbox.preferences')}</AppText>
        <AppText variant="muted">{t('inbox.preferencesBody')}</AppText>
        {prefs.data?.map((p) => (
          <View key={p.category} style={{ gap: 6 }}>
            <AppText variant="label">{t(`notifications.categories.${p.category}`)}</AppText>
            {CHANNELS.map((channel) => {
              const label = t(`notifications.channels.${channel}`);
              return (
                <View key={channel} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <AppText style={{ flex: 1 }}>{label}</AppText>
                  <Switch
                    accessibilityLabel={`${t(`notifications.categories.${p.category}`)}: ${label}`}
                    value={p.channels[channel]}
                    disabled={setPref.isPending}
                    onValueChange={(enabled) => setPref.mutate({ category: p.category, channel, enabled })}
                  />
                </View>
              );
            })}
          </View>
        ))}
        <AppText variant="muted">{t('inbox.inAppNote')}</AppText>
      </Card>
    </Screen>
  );
}
