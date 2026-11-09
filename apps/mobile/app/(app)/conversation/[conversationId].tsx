import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MESSAGE_MAX_ATTACHMENTS, MESSAGE_MAX_LENGTH, REPORT_REASONS } from '@pt/domain';
import { ApiError, withMessage, type Message, type MessageAttachmentInfo, type MessagePagesLike, type ReportReasonKey } from '@pt/api-client';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, TextInput, View } from 'react-native';
import { formatDateTime } from '@/features/work';
import { messagingKey, useRealtimeStatus } from '@/features/messaging';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { askPhotoSource, PhotoPermissionError, pickPhoto, uploadPhoto } from '@/lib/photo';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Button } from '@/ui/kit';
import { SecureImage } from '@/ui/secure-image';
import { Sheet } from '@/ui/sheet';
import { radius, useColors } from '@/ui/theme';
import { useOrgContext } from '@/features/org';

function Attachment({ a }: { a: MessageAttachmentInfo }) {
  const t = useT();
  const c = useColors();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const open = useMutation({
    mutationFn: () => api.org(orgId).files.downloadUrl(a.fileId),
    onSuccess: ({ url }) => void Linking.openURL(url),
  });
  if (a.mimeType.startsWith('image/') && a.mimeType !== 'image/heic') return <SecureImage fileId={a.fileId} label={a.fileName} size={180} />;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${t('messaging.download')} ${a.fileName}`} onPress={() => open.mutate()} style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.md, padding: 8, backgroundColor: c.surface }}>
      <AppText variant="label">{a.fileName}</AppText>
      <AppText variant="muted">{open.isPending ? t('messaging.uploading') : t('messaging.download')}</AppText>
    </Pressable>
  );
}

function Bubble({ m, mine, onDelete, onReport }: { m: Message; mine: boolean; onDelete: () => void; onReport: () => void }) {
  const t = useT();
  const c = useColors();
  const locale = usePrefs((s) => s.locale);
  const bg = m.deleted ? 'transparent' : mine ? c.accent : c.surface2;
  const fg = mine && !m.deleted ? c.accentInk : c.ink;
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', gap: 2 }}>
      <Pressable
        accessibilityHint={m.deleted ? undefined : mine ? t('messaging.deleteMessage') : t('messaging.report')}
        onLongPress={() => {
          if (m.deleted) return;
          if (!mine) return onReport();
          Alert.alert(t('messaging.deleteMessage'), t('messaging.deleteConfirm'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('messaging.deleteMessage'), style: 'destructive', onPress: onDelete },
          ]);
        }}
        style={{ backgroundColor: bg, borderRadius: radius.lg, padding: 10, gap: 8, borderWidth: m.deleted ? 1 : 0, borderColor: c.line, borderStyle: m.deleted ? 'dashed' : 'solid' }}
      >
        {m.deleted ? <AppText variant="muted" style={{ fontStyle: 'italic' }}>{t('messaging.deleted')}</AppText> : m.body ? <Text color={fg}>{m.body}</Text> : null}
        {m.attachments.map((a) => <Attachment key={a.fileId} a={a} />)}
      </Pressable>
      <AppText variant="muted" style={{ alignSelf: mine ? 'flex-end' : 'flex-start' }}>{formatDateTime(m.createdAt, locale)}</AppText>
    </View>
  );
}

/** Body text in the bubble's own colour (AppText fixes its colour by variant). */
function Text({ children, color }: { children: string; color: string }) {
  return <AppText style={{ color }}>{children}</AppText>;
}

/** One conversation: newest message at the bottom, paging back in time, read marker, composer with photo attach. */
export default function Conversation() {
  const t = useT();
  const c = useColors();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const { context } = useOrgContext();
  const me = context?.membership.id;
  const status = useRealtimeStatus();
  const key = messagingKey(orgId, 'messages', conversationId);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);

  const summary = useQuery({ queryKey: messagingKey(orgId, 'conversation', conversationId), queryFn: () => api.org(orgId).messaging.conversations.get(conversationId!) });
  const list = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.org(orgId).messaging.conversations.messages(conversationId!, { cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const newest = items[0];
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: messagingKey(orgId, 'conversations') });
    void queryClient.invalidateQueries({ queryKey: messagingKey(orgId, 'conversation', conversationId) });
    void queryClient.invalidateQueries({ queryKey: messagingKey(orgId, 'unread') });
  };

  // What you can see counts as read: the marker follows the newest message from the other person.
  const read = useMutation({ mutationFn: () => api.org(orgId).messaging.conversations.read(conversationId!), onSuccess: refresh });
  const markRead = read.mutate;
  const unread = summary.data?.unreadCount ?? 0;
  useEffect(() => {
    if (newest && unread > 0 && newest.senderMembershipId !== me) markRead();
  }, [newest?.id, unread, me, markRead]);

  const send = useMutation({
    mutationFn: () => api.org(orgId).messaging.conversations.send(conversationId!, { body: text.trim() || undefined, fileIds: files.length ? files.map((f) => f.id) : undefined }),
    onSuccess: (m) => {
      setText('');
      setFiles([]);
      queryClient.setQueryData<MessagePagesLike>(key, (old) => withMessage(old, m));
      refresh();
    },
  });
  const attach = useMutation({
    mutationFn: async () => {
      if (files.length >= MESSAGE_MAX_ATTACHMENTS) return;
      const source = await askPhotoSource(t);
      if (!source) return;
      const photo = await pickPhoto(source);
      if (!photo) return;
      const stored = await uploadPhoto(orgId, photo, { sensitive: false });
      setFiles((prev) => [...prev, { id: stored.id, name: photo.fileName }]);
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.org(orgId).messaging.conversations.deleteMessage(conversationId!, id), onSuccess: refresh });
  const mute = useMutation({ mutationFn: () => api.org(orgId).messaging.conversations.mute(conversationId!, !summary.data?.muted), onSuccess: refresh });
  const block = useMutation({ mutationFn: (blocked: boolean) => api.org(orgId).messaging.conversations.block(conversationId!, blocked), onSuccess: refresh });
  const [options, setOptions] = useState(false);
  const [reporting, setReporting] = useState<Message | null>(null);
  const [reported, setReported] = useState(false);
  const report = useMutation({
    mutationFn: (v: { messageId: string; reason: ReportReasonKey }) => api.org(orgId).messaging.conversations.report(conversationId!, v.messageId, { reason: v.reason }),
    onSuccess: () => { setReporting(null); setReported(true); },
  });

  const empty = text.trim().length === 0 && files.length === 0;
  const tooLong = text.length > MESSAGE_MAX_LENGTH;
  const failure = send.error ?? attach.error ?? remove.error ?? mute.error ?? block.error;
  const cannotSend = summary.data ? !summary.data.canSend : false;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen
        options={{
          title: summary.data?.other?.fullName ?? t('messaging.title'),
          headerRight: () => (summary.data ? <Pressable accessibilityRole="button" onPress={() => setOptions(true)} hitSlop={10}><AppText variant="label">{t('messaging.options')}</AppText></Pressable> : null),
        }}
      />
      {status !== 'live' ? <View style={{ paddingHorizontal: 16, paddingTop: 6 }}><AppText variant="muted">{t('messaging.liveOff')}</AppText></View> : null}
      <FlatList
        inverted
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        data={items}
        keyExtractor={(m) => m.id}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={list.isPending ? <ActivityIndicator color={c.accent} /> : <AppText variant="muted" style={{ textAlign: 'center' }}>{t('messaging.noMessages')}</AppText>}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={c.accent} /> : undefined}
        renderItem={({ item }) => <Bubble m={item} mine={item.senderMembershipId === me} onDelete={() => remove.mutate(item.id)} onReport={() => setReporting(item)} />}
      />
      <Sheet visible={options} title={t('messaging.options')} onClose={() => setOptions(false)}>
        <Button title={summary.data?.muted ? t('messaging.unmute') : t('messaging.mute')} variant="secondary" onPress={() => { setOptions(false); mute.mutate(); }} />
        {summary.data?.blockedByMe ? (
          <Button title={t('messaging.unblock')} variant="secondary" onPress={() => { setOptions(false); block.mutate(false); }} />
        ) : (
          <Button title={t('messaging.block')} variant="danger" onPress={() => { setOptions(false); Alert.alert(t('messaging.block'), t('messaging.blockConfirm'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('messaging.block'), style: 'destructive', onPress: () => block.mutate(true) }]); }} />
        )}
        <Button title={t('common.cancel')} variant="secondary" onPress={() => setOptions(false)} />
      </Sheet>
      <Sheet visible={reporting !== null} title={t('messaging.reportTitle')} onClose={() => setReporting(null)}>
        <AppText variant="muted">{t('messaging.reportHint')}</AppText>
        {report.isError ? <Banner>{report.error instanceof ApiError && report.error.code === 'CONFLICT' ? t('messaging.reportAlready') : errorMessage(report.error)}</Banner> : null}
        {REPORT_REASONS.map((reason) => <Button key={reason} title={t(`messaging.reportReasons.${reason}`)} variant="secondary" loading={report.isPending && report.variables?.reason === reason} disabled={report.isPending} onPress={() => report.mutate({ messageId: reporting!.id, reason })} />)}
        <Button title={t('common.cancel')} variant="secondary" onPress={() => setReporting(null)} />
      </Sheet>
      {cannotSend ? (
        <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
          {reported ? <Banner tone="ok">{t('messaging.reportSent')}</Banner> : null}
          <AppText variant="muted" accessibilityRole="alert">{summary.data?.blockedByMe ? t('messaging.blockedByMe') : t('messaging.cannotSend')}</AppText>
          {summary.data?.blockedByMe ? <Button title={t('messaging.unblock')} variant="secondary" loading={block.isPending} onPress={() => block.mutate(false)} /> : null}
        </View>
      ) : (
      <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
        {reported ? <Banner tone="ok">{t('messaging.reportSent')}</Banner> : null}
        {list.isError ? <Banner>{errorMessage(list.error)}</Banner> : null}
        {failure ? <Banner>{failure instanceof PhotoPermissionError ? t('checkin.photoPermission') : errorMessage(failure) || t('messaging.sendFailed')}</Banner> : null}
        {files.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {files.map((f) => (
              <Pressable key={f.id} accessibilityRole="button" accessibilityLabel={`${t('messaging.removeAttachment')}: ${f.name}`} onPress={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))} style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 4 }}>
                <AppText variant="muted">{f.name} ✕</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
        {tooLong ? <AppText variant="error">{t('messaging.tooLong')}</AppText> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ width: 84 }}><Button title={t('messaging.photo')} variant="secondary" loading={attach.isPending} disabled={send.isPending} onPress={() => attach.mutate()} /></View>
          <TextInput
            accessibilityLabel={t('messaging.typeMessage')}
            placeholder={t('messaging.typeMessage')}
            placeholderTextColor={c.muted}
            value={text}
            onChangeText={setText}
            multiline
            style={{ flex: 1, minHeight: 48, maxHeight: 120, borderWidth: 1, borderColor: tooLong ? c.danger : c.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink, backgroundColor: c.bg, textAlign: 'left' }}
          />
          <View style={{ width: 84 }}><Button title={t('messaging.send')} loading={send.isPending} disabled={empty || tooLong || attach.isPending} onPress={() => send.mutate()} /></View>
        </View>
      </View>
      )}
    </KeyboardAvoidingView>
  );
}
