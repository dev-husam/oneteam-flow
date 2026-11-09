import { Redirect } from 'expo-router';
import { useAuth } from '@/stores/auth';
import { usePrefs } from '@/stores/prefs';

/** Entry point: send the user to the right area for their state. */
export default function Index() {
  const status = useAuth((s) => s.status);
  const orgId = usePrefs((s) => s.activeOrgId);
  if (status !== 'authenticated') return <Redirect href="/login" />;
  return <Redirect href={orgId ? '/(app)/(tabs)' : '/select-organization'} />;
}
