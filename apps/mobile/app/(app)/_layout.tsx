import { Stack } from 'expo-router';
import { RealtimeProvider } from '@/features/messaging';
import { useT } from '@/i18n/hooks';

export default function AppLayout() {
  const t = useT();
  return (
    <RealtimeProvider>
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: t('nav.profile') }} />
      <Stack.Screen name="appearance" options={{ title: t('appearance.title') }} />
      <Stack.Screen name="security" options={{ title: t('nav.security') }} />
      <Stack.Screen name="notifications" options={{ title: t('inbox.title') }} />
      <Stack.Screen name="task/[taskId]" options={{ title: t('tasks.title') }} />
      <Stack.Screen name="session/[sessionId]" options={{ title: t('nav.workouts') }} />
      <Stack.Screen name="client/[membershipId]" options={{ title: t('nav.clients') }} />
      <Stack.Screen name="coaching" options={{ title: t('nav.coaching') }} />
      <Stack.Screen name="coaching-client/[membershipId]" options={{ title: t('nav.coaching') }} />
      <Stack.Screen name="my-coaching" options={{ title: t('nav.myCoaching') }} />
      <Stack.Screen name="my-checkin" options={{ title: t('nav.checkin') }} />
      <Stack.Screen name="checkins/index" options={{ title: t('nav.checkins') }} />
      <Stack.Screen name="checkins/[checkinId]" options={{ title: t('nav.checkins') }} />
      <Stack.Screen name="new-message" options={{ title: t('messaging.newTitle') }} />
      <Stack.Screen name="conversation/[conversationId]" options={{ title: t('messaging.title') }} />
    </Stack>
    </RealtimeProvider>
  );
}
