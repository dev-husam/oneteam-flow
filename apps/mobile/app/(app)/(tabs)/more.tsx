import { useRouter } from 'expo-router';
import { Alert, View } from 'react-native';
import { useOrgContext } from '@/features/org';
import { useT } from '@/i18n/hooks';
import { useAuth } from '@/stores/auth';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Button, Row, Screen } from '@/ui/kit';

export default function More() {
  const t = useT();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { locale, setLocale, setActiveOrg, restartNeeded } = usePrefs();
  const { can, context } = useOrgContext();
  const fitness = Boolean(context?.enabledModules.includes('fitness'));
  const coaching = Boolean(context?.enabledModules.includes('coaching'));

  const confirmSignOut = () =>
    Alert.alert(t('shell.signOut'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('shell.signOut'), style: 'destructive', onPress: () => void logout() },
    ]);

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <AppText variant="heading">{user?.fullName}</AppText>
        <AppText variant="muted">{user?.email}</AppText>
      </View>
      {restartNeeded ? <Banner tone="warn">{t('mobile.restartForDirection')}</Banner> : null}
      <View>
        {coaching && can('coaching.session.manage') ? <Row title={t('nav.coaching')} onPress={() => router.push('/(app)/coaching')} /> : null}
        {coaching && can('coaching.assessment.submit') && !can('coaching.session.manage') ? <Row title={t('nav.myCoaching')} onPress={() => router.push('/(app)/my-coaching')} /> : null}
        {fitness && can('fitness.checkin.submit') ? <Row title={t('nav.checkin')} onPress={() => router.push('/(app)/my-checkin')} /> : null}
        {fitness && can('fitness.checkin.review') ? <Row title={t('nav.checkins')} onPress={() => router.push('/(app)/checkins')} /> : null}
        <Row title={t('nav.profile')} onPress={() => router.push('/(app)/profile')} />
        <Row title={t('appearance.title')} onPress={() => router.push('/(app)/appearance')} />
        <Row title={t('nav.security')} onPress={() => router.push('/(app)/security')} />
        <Row title={t('orgs.switch')} onPress={() => { setActiveOrg(null); router.replace('/select-organization'); }} />
      </View>
      <View style={{ gap: 8 }}>
        <AppText variant="label">{t('language.label')}</AppText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title={t('language.en')} variant={locale === 'en' ? 'primary' : 'secondary'} onPress={() => setLocale('en')} /></View>
          <View style={{ flex: 1 }}><Button title={t('language.ar')} variant={locale === 'ar' ? 'primary' : 'secondary'} onPress={() => setLocale('ar')} /></View>
        </View>
      </View>
      <Button title={t('shell.signOut')} variant="danger" onPress={confirmSignOut} />
    </Screen>
  );
}
