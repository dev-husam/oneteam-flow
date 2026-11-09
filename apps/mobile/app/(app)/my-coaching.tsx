import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useOrgContext } from '@/features/org';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { AssessmentForm, ResourceCard, SessionCard, useWhen } from '@/ui/coaching-parts';
import { AppText, Banner, Button, Card, Screen } from '@/ui/kit';

/** The client’s coaching: upcoming sessions, what to complete, notes from the coach, shared resources. */
export default function MyCoaching() {
  const t = useT();
  const when = useWhen();
  const errorMessage = useErrorMessage();
  const { orgId, context } = useOrgContext();
  const me = context?.membership.id;
  const [answering, setAnswering] = useState<string | null>(null);
  const sessions = useQuery({ queryKey: ['org', orgId, 'coaching', 'sessions'], queryFn: () => api.org(orgId!).coaching.sessions.list({ order: 'asc' }), enabled: Boolean(orgId) });
  const open = useQuery({ queryKey: ['org', orgId, 'coaching', 'assessments', 'open'], queryFn: () => api.org(orgId!).coaching.assessments.list({ status: 'REQUESTED' }), enabled: Boolean(orgId) });
  const notes = useQuery({ queryKey: ['org', orgId, 'coaching', 'notes', me], queryFn: () => api.org(orgId!).coaching.notes.list(me!), enabled: Boolean(orgId && me) });
  const resources = useQuery({ queryKey: ['org', orgId, 'coaching', 'resources'], queryFn: () => api.org(orgId!).coaching.resources.list(), enabled: Boolean(orgId) });
  const upcoming = sessions.data?.filter((s) => s.status === 'PLANNED') ?? [];
  const failure = sessions.error ?? open.error ?? notes.error ?? resources.error;

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <AppText variant="title">{t('coaching.mine.title')}</AppText>
        <AppText variant="muted">{t('coaching.mine.subtitle')}</AppText>
      </View>
      {failure ? <Banner>{errorMessage(failure)}</Banner> : null}
      {sessions.isPending ? <ActivityIndicator /> : null}

      <AppText variant="heading">{t('coaching.upcoming')}</AppText>
      {sessions.data && upcoming.length === 0 ? <AppText variant="muted">{sessions.data.length === 0 ? t('coaching.mine.noCoach') : t('coaching.noUpcoming')}</AppText> : null}
      {upcoming.map((s) => <SessionCard key={s.id} session={s} orgId={orgId!} manage={false} />)}

      <AppText variant="heading">{t('coaching.assessments.todo')}</AppText>
      {open.data?.length === 0 ? <AppText variant="muted">{t('coaching.assessments.noneTodo')}</AppText> : null}
      {open.data?.map((a) =>
        answering === a.id ? (
          <AssessmentForm key={a.id} assessment={a} orgId={orgId!} onDone={() => setAnswering(null)} />
        ) : (
          <Card key={a.id}>
            <AppText variant="heading">{a.title}</AppText>
            <AppText variant="muted">{t('coaching.assessments.requestedBy', { name: a.requestedByName })}{a.dueAt ? ` · ${t('coaching.assessments.due', { date: when(a.dueAt, false) })}` : ''}</AppText>
            <Button title={t('coaching.assessments.complete')} onPress={() => setAnswering(a.id)} />
          </Card>
        ),
      )}

      <AppText variant="heading">{t('coaching.mine.notes')}</AppText>
      {notes.data?.length === 0 ? <AppText variant="muted">{t('coaching.notes.none')}</AppText> : null}
      {notes.data?.map((n) => (
        <Card key={n.id}>
          <AppText variant="muted">{n.authorName} · {when(n.createdAt, false)}</AppText>
          <AppText>{n.body}</AppText>
        </Card>
      ))}

      <AppText variant="heading">{t('coaching.resources.title')}</AppText>
      {resources.data?.length === 0 ? <AppText variant="muted">{t('coaching.resources.emptyMine')}</AppText> : null}
      {resources.data?.map((r) => <ResourceCard key={r.id} resource={r} orgId={orgId!} />)}
    </Screen>
  );
}
