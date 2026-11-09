import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { useAuth } from '@/stores/auth';
import { AppText, Banner, Button, Card, Row, Screen } from '@/ui/kit';

/** Two-factor status (set-up happens on the web, where the QR code is easiest to scan) and signed-in devices. */
export default function Security() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const mfaEnabled = useAuth((s) => s.user?.mfaEnabled);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.me.sessions() });
  const revoke = useMutation({ mutationFn: (id: string) => api.me.revokeSession(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }) });

  return (
    <Screen>
      <Card>
        <AppText variant="heading">{t('mfa.title')}</AppText>
        <AppText variant="muted">{mfaEnabled ? t('mfa.onBody') : t('mobile.mfaOnWeb')}</AppText>
      </Card>
      {sessions.isError || revoke.isError ? <Banner>{errorMessage(sessions.error ?? revoke.error)}</Banner> : null}
      <AppText variant="heading">{t('security.sessions')}</AppText>
      <View>
        {sessions.data?.map((s) => (
          <Row
            key={s.id}
            title={`${s.deviceName ?? t(`security.client${s.clientType}`)}${s.current ? ` · ${t('security.thisDevice')}` : ''}`}
            subtitle={t('security.lastActive', { when: new Date(s.lastUsedAt).toLocaleString(t.locale) })}
            right={s.current ? undefined : <Button title={t('security.revoke')} variant="danger" onPress={() => revoke.mutate(s.id)} />}
          />
        ))}
      </View>
    </Screen>
  );
}
