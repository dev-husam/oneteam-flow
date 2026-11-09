import { useRouter } from 'expo-router';
import { RefreshControl, View } from 'react-native';
import { ScrollView } from 'react-native';
import { useMyOrganizations } from '@/features/org';
import { useErrorMessage, useRoleLabel, useT } from '@/i18n/hooks';
import { useAuth } from '@/stores/auth';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Button, Card, Row, Screen } from '@/ui/kit';
import { useColors } from '@/ui/theme';

/** Shown when the user belongs to several organizations (or none yet): pick the workspace to open. */
export default function SelectOrganization() {
  const t = useT();
  const roleLabel = useRoleLabel();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const c = useColors();
  const logout = useAuth((s) => s.logout);
  const setActiveOrg = usePrefs((s) => s.setActiveOrg);
  const mine = useMyOrganizations();

  // One organization: no choice to make.
  if (mine.data?.length === 1 && mine.data[0]!.organization.status === 'ACTIVE') {
    const only = mine.data[0]!;
    setTimeout(() => { setActiveOrg(only.organization.id); router.replace('/(app)/(tabs)'); }, 0);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} refreshControl={<RefreshControl refreshing={mine.isFetching} onRefresh={() => void mine.refetch()} />}>
      <Screen scroll={false}>
        <AppText variant="title">{t('orgs.yours')}</AppText>
        {mine.isError ? <Banner>{errorMessage(mine.error)}</Banner> : null}
        {mine.data?.length === 0 && (
          <Card>
            <AppText variant="heading">{t('orgs.emptyTitle')}</AppText>
            <AppText variant="muted">{t('orgs.emptyBody')}</AppText>
          </Card>
        )}
        <View>
          {mine.data?.map((m) => (
            <Row
              key={m.organization.id}
              title={m.organization.name}
              subtitle={m.organization.status === 'ACTIVE' ? roleLabel(m.role) : t('orgs.suspended')}
              onPress={m.organization.status === 'ACTIVE' ? () => { setActiveOrg(m.organization.id); router.replace('/(app)/(tabs)'); } : undefined}
            />
          ))}
        </View>
        <Button title={t('shell.signOut')} variant="secondary" onPress={() => void logout()} />
      </Screen>
    </ScrollView>
  );
}
