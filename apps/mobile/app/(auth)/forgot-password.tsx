import { Link } from 'expo-router';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { AppText, Banner, Button, Screen, TextField } from '@/ui/kit';

export default function ForgotPassword() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.auth.requestPasswordReset(email.trim().toLowerCase());
      setSent(true); // the API answers the same for unknown addresses
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppText variant="title">{t('auth.forgot.title')}</AppText>
      {sent ? <Banner tone="ok">{t('auth.forgot.successBody')}</Banner> : <AppText variant="muted">{t('auth.forgot.subtitle')}</AppText>}
      {error ? <Banner>{error}</Banner> : null}
      {!sent && (
        <>
          <TextField label={t('auth.login.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          <Button title={t('auth.forgot.submit')} onPress={submit} loading={busy} disabled={!email} />
        </>
      )}
      <Link href="/login"><AppText variant="label">{t('auth.forgot.backToLogin')}</AppText></Link>
    </Screen>
  );
}
