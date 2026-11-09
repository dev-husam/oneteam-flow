import { checkPassword } from '@pt/domain';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { api } from '@/lib/api';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { useBrand } from '@/stores/brand';
import { usePrefs } from '@/stores/prefs';
import { BrandHeader } from '@/ui/brand-header';
import { AppText, Banner, Button, Screen, TextField } from '@/ui/kit';

export default function Register() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const locale = usePrefs((s) => s.locale);
  const registrationOpen = useBrand((s) => s.config.features.registration);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  // Same rules as the server (shared package): immediate feedback, the API stays the authority.
  const weak = password.length > 0 && checkPassword(password, email).length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.auth.register({ fullName: fullName.trim(), email: email.trim().toLowerCase(), password, acceptTerms: accepted, locale });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <AppText variant="title">{t('auth.register.successTitle')}</AppText>
        <AppText>{t('auth.register.successBody')}</AppText>
        <Link href="/login"><AppText variant="label">{t('auth.register.signIn')}</AppText></Link>
      </Screen>
    );
  }
  return (
    <Screen>
      <BrandHeader />
      <AppText variant="title">{t('auth.register.title')}</AppText>
      {!registrationOpen ? <Banner>{t('adminConfig.inviteOnly')}</Banner> : null}
      {error ? <Banner>{error}</Banner> : null}
      <TextField label={t('auth.register.fullName')} value={fullName} onChangeText={setFullName} autoComplete="name" />
      <TextField label={t('auth.register.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
      <TextField label={t('auth.register.password')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" error={weak ? t('validation.weakPassword') : undefined} />
      <AppText variant="muted">{t('auth.register.passwordHint')}</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Switch value={accepted} onValueChange={setAccepted} accessibilityLabel={t('auth.register.acceptTerms')} />
        <AppText style={{ flex: 1 }}>{t('auth.register.acceptTerms')}</AppText>
      </View>
      <Button title={t('auth.register.submit')} onPress={submit} loading={busy} disabled={!fullName.trim() || !email || weak || !password || !accepted} />
      <Link href="/login"><AppText variant="label">{t('auth.register.signIn')}</AppText></Link>
    </Screen>
  );
}
