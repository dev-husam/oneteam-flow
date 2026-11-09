import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type AssigneeStatus } from '@pt/api-client';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useOrgContext } from '@/features/org';
import { activityText, formatDate, formatDateTime } from '@/features/work';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Button, Card, Row, Screen, TextField } from '@/ui/kit';

const MY_STATUSES: AssigneeStatus[] = ['PENDING', 'IN_PROGRESS', 'DONE'];

export default function TaskScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const t = useT();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const locale = usePrefs((s) => s.locale);
  const { can, context } = useOrgContext();
  const [comment, setComment] = useState('');

  const task = useQuery({
    queryKey: ['org', orgId, 'tasks', taskId],
    queryFn: () => api.org(orgId).tasks.get(taskId),
    retry: (n, e) => n < 2 && !(e instanceof ApiError && e.status < 500),
  });
  const history = useQuery({ queryKey: ['org', orgId, 'tasks', taskId, 'history'], queryFn: () => api.org(orgId).tasks.history(taskId) });
  const comments = useInfiniteQuery({
    queryKey: ['org', orgId, 'tasks', taskId, 'comments'],
    queryFn: ({ pageParam }) => api.org(orgId).tasks.comments.list(taskId, { cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['org', orgId, 'tasks'] });
  const setStatus = useMutation({ mutationFn: (s: AssigneeStatus) => api.org(orgId).tasks.setStatus(taskId, s), onSuccess: refresh });
  const post = useMutation({ mutationFn: () => api.org(orgId).tasks.comments.add(taskId, comment.trim()), onSuccess: async () => { setComment(''); await refresh(); } });
  const open = useMutation({
    mutationFn: async (fileId: string) => {
      // The server checks access and returns a 60-second signed link; it is opened at once and never stored.
      const { url } = await api.org(orgId).files.downloadUrl(fileId);
      await Linking.openURL(url);
    },
  });

  if (task.isPending) return <Screen><ActivityIndicator /></Screen>;
  if (task.isError) return <Screen><Banner>{errorMessage(task.error)}</Banner></Screen>;
  const d = task.data;
  const myMembershipId = context?.membership.id;
  const mine = d.assignees.find((a) => a.membershipId === myMembershipId);
  const people = comments.data?.pages.flatMap((p) => p.data) ?? [];
  const error = setStatus.error ?? post.error ?? open.error;

  return (
    <Screen>
      <Stack.Screen options={{ title: d.title }} />
      {error ? <Banner>{errorMessage(error)}</Banner> : null}
      <View style={{ gap: 6 }}>
        <AppText variant="title">{d.title}</AppText>
        <AppText variant="muted">{[t(`tasks.status.${d.status}`), t(`tasks.priority.${d.priority}`), d.dueAt ? t('tasks.dueOn', { date: formatDate(d.dueAt, locale) }) : t('tasks.noDue')].join(' · ')}</AppText>
        <AppText variant="muted">{t('tasks.createdBy', { name: d.createdByName })}</AppText>
        {d.description ? <AppText>{d.description}</AppText> : null}
        {d.status === 'CANCELLED' ? <Banner tone="warn">{t('tasks.cancelledNotice')}</Banner> : null}
      </View>

      {mine ? (
        <Card>
          <AppText variant="label">{t('tasks.yourProgress')}</AppText>
          <View style={{ gap: 8 }}>
            {MY_STATUSES.map((s) => (
              <Button key={s} title={t(`tasks.myStatus.${s}`)} variant={mine.status === s ? 'primary' : 'secondary'} loading={setStatus.isPending && setStatus.variables === s} disabled={d.status === 'CANCELLED' || !can('task.update_status')} onPress={() => setStatus.mutate(s)} accessibilityState={{ selected: mine.status === s }} />
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <AppText variant="heading">{t('tasks.assignees')} · {t('tasks.progressOf', { done: d.assignees.filter((a) => a.status === 'DONE').length, total: d.assignees.length })}</AppText>
        {d.assignees.map((a) => <Row key={a.membershipId} title={a.fullName} subtitle={t(`tasks.myStatus.${a.status}`)} />)}
      </Card>

      <Card>
        <AppText variant="heading">{t('tasks.attachments')}</AppText>
        {d.attachments.length === 0 ? <AppText variant="muted">{t('tasks.noAttachments')}</AppText> : null}
        {d.attachments.map((a) => <Row key={a.fileId} title={a.name} subtitle={`${(a.sizeBytes / 1024).toFixed(0)} KB`} onPress={() => open.mutate(a.fileId)} />)}
      </Card>

      <Card>
        <AppText variant="heading">{t('tasks.comments')}</AppText>
        {people.length === 0 && !comments.isPending ? <AppText variant="muted">{t('tasks.noComments')}</AppText> : null}
        {people.map((c) => (
          <View key={c.id} style={{ gap: 2 }}>
            <AppText variant="label">{c.authorName} · {formatDateTime(c.createdAt, locale)}{c.edited ? ` (${t('tasks.edited')})` : ''}</AppText>
            <AppText>{c.body}</AppText>
          </View>
        ))}
        {comments.hasNextPage ? <Button title={t('common.loadMore')} variant="secondary" loading={comments.isFetchingNextPage} onPress={() => void comments.fetchNextPage()} /> : null}
        {can('task.comment') ? (
          <View style={{ gap: 8 }}>
            <TextField label={t('tasks.commentLabel')} value={comment} onChangeText={setComment} placeholder={t('tasks.commentPlaceholder')} multiline maxLength={4000} style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }} />
            <Button title={t('tasks.post')} loading={post.isPending} disabled={!comment.trim()} onPress={() => post.mutate()} />
          </View>
        ) : null}
      </Card>

      <Card>
        <AppText variant="heading">{t('tasks.history')}</AppText>
        {history.data?.length === 0 ? <AppText variant="muted">{t('tasks.noHistory')}</AppText> : null}
        {[...(history.data ?? [])].reverse().map((e) => (
          <AppText key={e.id} variant="muted">{activityText(t, e)} · {formatDateTime(e.createdAt, locale)}</AppText>
        ))}
      </Card>
    </Screen>
  );
}
