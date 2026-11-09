import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useOrgContext } from '@/features/org';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { SessionCard, useWhen } from '@/ui/coaching-parts';
import { AppText, Banner, Row, Screen } from '@/ui/kit';

/** The coach’s phone view: what is coming up, and the clients. (Scheduling and questionnaires are on the web.) */
export default function Coaching() {
  const t = useT();
  const when = useWhen();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const { orgId } = useOrgContext();
  const sessions = useQuery({ queryKey: ['org', orgId, 'coaching', 'sessions', 'planned'], queryFn: () => api.org(orgId!).coaching.sessions.list({ status: 'PLANNED', order: 'asc' }), enabled: Boolean(orgId) });
  const members = useQuery({ queryKey: ['org', orgId, 'coaching', 'clients'], queryFn: () => api.org(orgId!).members.list({ status: 'ACTIVE', limit: 100 }), enabled: Boolean(orgId) });
  const clients = (members.data?.data ?? []).filter((m) => m.role.key === 'participant');
  const next = new Map<string, string>();
  for (const s of sessions.data ?? []) if (!next.has(s.clientMembershipId)) next.set(s.clientMembershipId, s.startsAt);
  const failure = sessions.error ?? members.error;

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <AppText variant="title">{t('coaching.title')}</AppText>
        <AppText variant="muted">{t('coaching.subtitle')}</AppText>
      </View>
      {failure ? <Banner>{errorMessage(failure)}</Banner> : null}
      {sessions.isPending ? <ActivityIndicator /> : null}
      <AppText variant="heading">{t('coaching.upcoming')}</AppText>
      {sessions.data?.length === 0 ? <AppText variant="muted">{t('coaching.noUpcoming')}</AppText> : null}
      {sessions.data?.map((s) => <SessionCard key={s.id} session={s} orgId={orgId!} manage />)}
      <AppText variant="heading">{t('coaching.myClients')}</AppText>
      {members.data && clients.length === 0 ? <AppText variant="muted">{t('coaching.noClientsBody')}</AppText> : null}
      <View>
        {clients.map((c) => (
          <Row key={c.id} title={c.fullName} subtitle={`${t('coaching.nextSession')}: ${next.has(c.id) ? when(next.get(c.id)!) : t('coaching.none')}`} onPress={() => router.push(`/(app)/coaching-client/${c.id}`)} />
        ))}
      </View>
    </Screen>
  );
}
