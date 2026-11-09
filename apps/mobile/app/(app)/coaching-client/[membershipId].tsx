import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NoteVisibility } from '@pt/api-client';
import { SESSION_LIMITS } from '@pt/domain';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';
import { useOrgContext } from '@/features/org';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { SessionCard, useWhen } from '@/ui/coaching-parts';
import { AppText, Banner, Button, Card, Screen, TextField } from '@/ui/kit';

/** One client from the coach’s side: sessions and notes (shared or private). */
export default function CoachingClient() {
  const t = useT();
  const when = useWhen();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const { orgId, can } = useOrgContext();
  const [body, setBody] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const member = useQuery({ queryKey: ['org', orgId, 'coaching', 'member', membershipId], queryFn: () => api.org(orgId!).members.get(membershipId!), enabled: Boolean(orgId && membershipId) });
  const sessions = useQuery({ queryKey: ['org', orgId, 'coaching', 'sessions', membershipId], queryFn: () => api.org(orgId!).coaching.sessions.list({ clientMembershipId: membershipId, order: 'desc' }), enabled: Boolean(orgId && membershipId) });
  const notes = useQuery({ queryKey: ['org', orgId, 'coaching', 'notes', membershipId], queryFn: () => api.org(orgId!).coaching.notes.list(membershipId!), enabled: Boolean(orgId && membershipId) });
  const add = useMutation({
    mutationFn: () => api.org(orgId!).coaching.notes.create({ clientMembershipId: membershipId!, visibility: (isPrivate ? 'PRIVATE' : 'SHARED') as NoteVisibility, body }),
    onSuccess: async () => { setBody(''); await queryClient.invalidateQueries({ queryKey: ['org', orgId, 'coaching'] }); },
    onError: (e) => setError(errorMessage(e)),
  });
  const failure = member.error ?? sessions.error ?? notes.error;

  return (
    <Screen>
      <AppText variant="title">{member.data?.fullName ?? ''}</AppText>
      {failure ? <Banner>{errorMessage(failure)}</Banner> : null}
      {sessions.isPending ? <ActivityIndicator /> : null}

      {can('coaching.note.write') ? (
        <Card>
          <AppText variant="heading">{t('coaching.notes.add')}</AppText>
          <TextField label={t('coaching.notes.add')} value={body} onChangeText={setBody} multiline maxLength={SESSION_LIMITS.note} placeholder={t('coaching.notes.placeholder')} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Switch value={isPrivate} onValueChange={setPrivate} accessibilityLabel={t('coaching.notes.private')} />
            <AppText style={{ flex: 1 }}>{isPrivate ? t('coaching.notes.private') : t('coaching.notes.shared')}</AppText>
          </View>
          {isPrivate ? <AppText variant="muted">{t('coaching.notes.privateHint')}</AppText> : null}
          {error ? <Banner>{error}</Banner> : null}
          <Button title={t('coaching.notes.add')} loading={add.isPending} disabled={!body.trim()} onPress={() => { setError(null); add.mutate(); }} />
        </Card>
      ) : null}

      <AppText variant="heading">{t('coaching.notes.title')}</AppText>
      {notes.data?.length === 0 ? <AppText variant="muted">{t('coaching.notes.none')}</AppText> : null}
      {notes.data?.map((n) => (
        <Card key={n.id}>
          <AppText variant="muted">{n.visibility === 'PRIVATE' ? t('coaching.notes.private') : t('coaching.notes.shared')} · {when(n.createdAt)}{n.mine ? '' : ` · ${t('coaching.notes.by', { name: n.authorName })}`}</AppText>
          <AppText>{n.body}</AppText>
        </Card>
      ))}

      <AppText variant="heading">{t('coaching.sessions.title')}</AppText>
      {sessions.data?.length === 0 ? <AppText variant="muted">{t('coaching.sessions.none')}</AppText> : null}
      {sessions.data?.map((s) => <SessionCard key={s.id} session={s} orgId={orgId!} manage />)}
    </Screen>
  );
}
