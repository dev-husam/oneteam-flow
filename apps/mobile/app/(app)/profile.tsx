import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { useAuth } from '@/stores/auth';
import { usePrefs } from '@/stores/prefs';
import { Banner, Button, Screen, TextField } from '@/ui/kit';

export default function Profile() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const user = useAuth((s) => s.user)!;
  const setUser = useAuth((s) => s.setUser);
  const setLocale = usePrefs((s) => s.setLocale);
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [units, setUnits] = useState(user.unitSystem);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => api.me.update({ fullName: fullName.trim(), phone: phone.trim() || null, unitSystem: units }),
    onSuccess: (updated) => { setUser(updated); setLocale(updated.locale); setSaved(true); },
  });

  return (
    <Screen>
      {save.isError ? <Banner>{errorMessage(save.error)}</Banner> : null}
      {saved && !save.isPending ? <Banner tone="ok">{t('common.saved')}</Banner> : null}
      <TextField label={t('profile.fullName')} value={fullName} onChangeText={(v) => { setFullName(v); setSaved(false); }} autoComplete="name" />
      <TextField label={t('profile.email')} value={user.email} editable={false} />
      <TextField label={t('profile.phone')} value={phone} onChangeText={(v) => { setPhone(v); setSaved(false); }} keyboardType="phone-pad" placeholder="+966501234567" />
      <Button title={units === 'METRIC' ? t('profile.unitMetric') : t('profile.unitImperial')} variant="secondary" onPress={() => { setUnits(units === 'METRIC' ? 'IMPERIAL' : 'METRIC'); setSaved(false); }} />
      <Button title={t('common.save')} onPress={() => save.mutate()} loading={save.isPending} disabled={fullName.trim().length < 2} />
    </Screen>
  );
}
