import { View } from 'react-native';
import { useOrgContext } from '@/features/org';
import { useErrorMessage, useRoleLabel, useT } from '@/i18n/hooks';
import { useAuth } from '@/stores/auth';
import { AppText, Banner, Card, Screen } from '@/ui/kit';

export default function Home() {
  const t = useT();
  const roleLabel = useRoleLabel();
  const errorMessage = useErrorMessage();
  const user = useAuth((s) => s.user);
  const { context, isPending, isError, error } = useOrgContext();

  return (
    <Screen>
      <AppText variant="title">{t('dashboard.greeting', { name: user?.fullName.split(' ')[0] ?? '' })}</AppText>
      {isError ? <Banner>{errorMessage(error)}</Banner> : null}
      {isPending ? <AppText variant="muted">{t('common.loading')}</AppText> : null}
      {context && (
        <>
          <Card>
            <AppText variant="muted">{t('mobile.organization')}</AppText>
            <AppText variant="heading">{context.organization.name}</AppText>
            <AppText variant="muted">{t('orgs.overviewSubtitle', { role: roleLabel(context.membership.role) })}</AppText>
          </Card>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Card style={{ flex: 1 }}>
              <AppText variant="muted">{t('orgs.statModules')}</AppText>
              <AppText variant="title">{context.enabledModules.length}</AppText>
            </Card>
            <Card style={{ flex: 1 }}>
              <AppText variant="muted">{t('mobile.permissions')}</AppText>
              <AppText variant="title">{context.permissions.length}</AppText>
            </Card>
          </View>
          {!user?.emailVerified && <Banner tone="warn">{t('dashboard.verifyEmailBody', { email: user?.email ?? '' })}</Banner>}
        </>
      )}
    </Screen>
  );
}
