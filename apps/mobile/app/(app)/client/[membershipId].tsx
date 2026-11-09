import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { formatDate } from '@/features/work';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Card, Row, Screen } from '@/ui/kit';

/** A client's profile, active plans and recent workouts. Read-only on mobile: plans and profiles are managed on the web. */
export default function ClientScreen() {
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const t = useT();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const locale = usePrefs((s) => s.locale);
  const client = useQuery({ queryKey: ['org', orgId, 'fitness', 'clients', membershipId], queryFn: () => api.org(orgId).fitness.clients.get(membershipId) });
  const sessions = useQuery({ queryKey: ['org', orgId, 'fitness', 'sessions', membershipId], queryFn: () => api.org(orgId).fitness.sessions.list({ clientMembershipId: membershipId, limit: 10 }) });

  if (client.isPending) return <Screen><ActivityIndicator /></Screen>;
  if (client.isError) return <Screen><Banner>{errorMessage(client.error)}</Banner></Screen>;
  const c = client.data;
  const p = c.profile;
  const facts: [string, string | null][] = [
    [t('fitness.profile.goalType'), p?.goalType ? t(`fitness.goal.${p.goalType}`) : null],
    [t('fitness.profile.activity'), p?.activityLevel ? t(`fitness.activity.${p.activityLevel}`) : null],
    [t('fitness.profile.height'), p?.heightCm != null ? `${p.heightCm} cm` : null],
    [t('fitness.profile.startingWeight'), c.startingWeightKg !== null ? `${c.startingWeightKg} kg` : null],
  ];

  return (
    <Screen>
      <Stack.Screen options={{ title: c.fullName }} />
      <View style={{ gap: 2 }}>
        <AppText variant="title">{c.fullName}</AppText>
        <AppText variant="muted">{c.email}</AppText>
      </View>
      <Card>
        <AppText variant="heading">{t('fitness.profile.title')}</AppText>
        {!p ? <AppText variant="muted">{t('fitness.profile.empty')}</AppText> : null}
        {facts.map(([label, value]) => <AppText key={label} variant="muted">{label}: <AppText>{value ?? '—'}</AppText></AppText>)}
        {p?.goalsText ? <AppText>{p.goalsText}</AppText> : null}
        {p?.injuriesNotes ? <><AppText variant="label">{t('fitness.profile.health')}</AppText><AppText>{p.injuriesNotes}</AppText></> : null}
      </Card>
      <Card>
        <AppText variant="muted">{t('fitness.clients.last30')}</AppText>
        <AppText variant="title">{c.stats.completedLast30Days}</AppText>
        <AppText variant="muted">{t('fitness.clients.lastWorkout')}: {c.stats.lastSessionAt ? formatDate(c.stats.lastSessionAt, locale) : t('fitness.clients.never')}</AppText>
      </Card>
      <Card>
        <AppText variant="heading">{t('fitness.clients.activePlans')}</AppText>
        {c.activePlans.length === 0 ? <AppText variant="muted">{t('fitness.clients.noPlan')}</AppText> : null}
        {c.activePlans.map((a) => <AppText key={a.assignmentId}>{a.planName} v{a.versionNo} · {formatDate(`${a.startDate}T00:00:00`, locale)}</AppText>)}
      </Card>
      <View>
        <AppText variant="heading">{t('fitness.clients.recentWorkouts')}</AppText>
        {sessions.data?.data.length === 0 ? <AppText variant="muted">{t('fitness.workouts.noHistory')}</AppText> : null}
        {sessions.data?.data.map((s) => (
          <Row key={s.id} title={s.dayName} subtitle={`${s.planName} · ${formatDate(`${s.scheduledDate}T00:00:00`, locale)} · ${s.completedAt ? t('fitness.workouts.completed') : t('fitness.workouts.inProgress')}`} onPress={() => router.push(`/(app)/session/${s.id}`)} />
        ))}
      </View>
    </Screen>
  );
}
