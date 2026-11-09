import { useQuery } from '@tanstack/react-query';
import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { ApiError } from '@pt/api-client';
import { useUnreadMessages } from '@/features/messaging';
import { useOrgContext } from '@/features/org';
import { useT } from '@/i18n/hooks';
import { useBrand } from '@/stores/brand';
import { usePrefs } from '@/stores/prefs';
import { useColors } from '@/ui/theme';
import { registerPush } from '@/lib/push';
import { api } from '@/lib/api';
import { AppText } from '@/ui/kit';

/**
 * Tabs for the active organization. Which tabs exist comes from the server's permissions for THIS member:
 * a client sees Home and More, a trainer also sees Members. The API enforces the same rules on every call.
 */
export default function TabsLayout() {
  const t = useT();
  const c = useColors();
  const router = useRouter();
  const locale = usePrefs((s) => s.locale);
  const setActiveOrg = usePrefs((s) => s.setActiveOrg);
  const { can, error, context } = useOrgContext();
  // Unread count for the header: refreshed every minute while the app is in the foreground.
  const unread = useQuery({ queryKey: ['notifications', 'unread-count'], queryFn: () => api.me.notifications.unreadCount(), refetchInterval: 60_000 });
  const count = unread.data ?? 0;
  const fitness = Boolean(context?.enabledModules.includes('fitness'));
  const unreadMessages = useUnreadMessages();
  const orgDesign = context?.design;
  const personalAllowed = context?.features.user_design_choice !== false;

  // An organization with its own design: apply it while this organization is open, and drop it when leaving.
  useEffect(() => {
    useBrand.getState().setOrgDesign(orgDesign ?? null);
    useBrand.getState().setPersonalAllowed(personalAllowed);
    return () => {
      useBrand.getState().setOrgDesign(null);
      useBrand.getState().setPersonalAllowed(true);
    };
  }, [orgDesign, personalAllowed]);

  // Access to the organization was lost (removed, organization suspended): back to the chooser.
  useEffect(() => {
    if (error instanceof ApiError && (error.status === 404 || error.code === 'ORGANIZATION_SUSPENDED')) {
      setActiveOrg(null);
      router.replace('/select-organization');
    }
  }, [error, setActiveOrg, router]);

  useEffect(() => {
    void registerPush(locale);
  }, [locale]);

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: c.link, headerTitleAlign: 'center', tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line }, headerStyle: { backgroundColor: c.surface }, headerTintColor: c.ink, headerRight: () => (
        <Pressable accessibilityRole="button" accessibilityLabel={count > 0 ? `${t('inbox.open')}. ${t('inbox.unread', { count })}` : t('inbox.open')} onPress={() => router.push('/(app)/notifications')} hitSlop={10} style={{ paddingHorizontal: 16 }}>
          <AppText variant="label">{t('inbox.title')}{count > 0 ? ` (${count > 99 ? '99+' : count})` : ''}</AppText>
        </Pressable>
      ) }}>
      <Tabs.Screen name="index" options={{ title: context?.organization.name ?? t('nav.overview'), tabBarLabel: t('nav.overview') }} />
      <Tabs.Screen name="tasks" options={{ title: t('nav.tasks'), href: can('task.read') ? undefined : null }} />
      <Tabs.Screen name="messages" options={{ title: t('nav.messages'), href: can('message.send') && context?.features.messaging !== false ? undefined : null, tabBarBadge: unreadMessages > 0 ? (unreadMessages > 99 ? '99+' : unreadMessages) : undefined }} />
      <Tabs.Screen name="progress" options={{ title: t('nav.progress'), href: can('progress.read') ? undefined : null }} />
      <Tabs.Screen name="clients" options={{ title: t('nav.clients'), href: fitness && can('fitness.workout_plan.assign') ? undefined : null }} />
      <Tabs.Screen name="workouts" options={{ title: t('nav.workouts'), href: fitness && can('fitness.workout.log') ? undefined : null }} />
      <Tabs.Screen name="nutrition" options={{ title: t('nav.nutrition'), href: fitness && can('fitness.nutrition.log') ? undefined : null }} />
      {/* Fitness organizations use Clients instead: a members list adds little on a phone. */}
      <Tabs.Screen name="members" options={{ title: t('nav.members'), href: can('member.read') && !fitness ? undefined : null }} />
      <Tabs.Screen name="more" options={{ title: t('mobile.more') }} />
    </Tabs>
  );
}
