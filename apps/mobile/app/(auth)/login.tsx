import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@pt/api-client';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { useAuth } from '@/stores/auth';
import { useBrand } from '@/stores/brand';
import { BrandHeader } from '@/ui/brand-header';
import { AppText, Banner, Button, Screen, TextField } from '@/ui/kit';

/** Email + password, then (for accounts with two-factor authentication) the code or a recovery code. */
export default function Login() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { login, completeMfa } = useAuth();
  const registrationOpen = useBrand((s) => s.config.features.registration);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mfaToken) {
        await completeMfa(mfaToken, code.trim());
      } else {
        const outcome = await login(email.trim().toLowerCase(), password);
        if (outcome.status === 'mfa') return setMfaToken(outcome.mfaToken);
      }
      router.replace('/');
    } catch (err) {
      // The five-minute second-factor window ended: start again from the password.
      if (err instanceof ApiError && err.code === 'MFA_TOKEN_INVALID') {
        setMfaToken(null);
        setCode('');
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (mfaToken) {
    return (
      <Screen>
        <AppText variant="title">{t('mfa.loginTitle')}</AppText>
        <AppText variant="muted">{t('mfa.loginHint')}</AppText>
        {error ? <Banner>{error}</Banner> : null}
        <TextField label={t('mfa.code')} value={code} onChangeText={setCode} keyboardType="default" autoCapitalize="none" autoCorrect={false} autoComplete="one-time-code" maxLength={11} autoFocus />
        <Button title={t('mfa.verify')} onPress={submit} loading={busy} disabled={code.trim().length < 6} />
        <Button title={t('mfa.startOver')} variant="secondary" onPress={() => { setMfaToken(null); setCode(''); setError(null); }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <BrandHeader />
      <View style={{ gap: 4, marginTop: 16 }}>
        <AppText variant="title">{t('auth.login.title')}</AppText>
        <AppText variant="muted">{t('auth.login.subtitle')}</AppText>
      </View>
      {error ? <Banner>{error}</Banner> : null}
      <TextField label={t('auth.login.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
      <TextField label={t('auth.login.password')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" onSubmitEditing={submit} />
      <Button title={t('auth.login.submit')} onPress={submit} loading={busy} disabled={!email || !password} />
      <Link href="/forgot-password"><AppText variant="label">{t('auth.login.forgot')}</AppText></Link>
      {registrationOpen ? <Link href="/register"><AppText variant="label">{t('auth.login.createAccount')}</AppText></Link> : null}
    </Screen>
  );
}
