import type { AppNotification } from '@pt/api-client';

/** Where a notification leads, from the small deep-link payload the server attached (never a full URL). */
export function notificationHref(n: Pick<AppNotification, 'data'>): string | null {
  const orgSlug = typeof n.data?.orgSlug === 'string' ? n.data.orgSlug : null;
  if (!orgSlug || !/^[a-z0-9-]+$/.test(orgSlug)) return null;
  const taskId = typeof n.data?.taskId === 'string' ? n.data.taskId : null;
  if (taskId && /^[0-9a-f-]{36}$/i.test(taskId)) return `/o/${orgSlug}/tasks/${taskId}`;
  if (typeof n.data?.goalId === 'string') return `/o/${orgSlug}/progress`;
  const checkinId = typeof n.data?.checkinId === 'string' ? n.data.checkinId : null;
  if (checkinId && /^[0-9a-f-]{36}$/i.test(checkinId)) return `/o/${orgSlug}/checkins/${checkinId}`;
  const conversationId = typeof n.data?.conversationId === 'string' ? n.data.conversationId : null;
  if (conversationId && /^[0-9a-f-]{36}$/i.test(conversationId)) return `/o/${orgSlug}/messages?c=${conversationId}`;
  if (n.data?.coaching === 'client') return `/o/${orgSlug}/my-coaching`;
  const coachClientId = typeof n.data?.coachClientId === 'string' ? n.data.coachClientId : null;
  if (coachClientId && /^[0-9a-f-]{36}$/i.test(coachClientId)) return `/o/${orgSlug}/coaching/clients/${coachClientId}`;
  if (n.data?.coaching === 'coach') return `/o/${orgSlug}/coaching`;
  if (n.data?.reports === '1') return `/o/${orgSlug}/message-reports`;
  if (n.data?.checkin === '1') return `/o/${orgSlug}/checkin`;
  if (n.data?.nutrition === '1') return `/o/${orgSlug}/nutrition`;
  const clientId = typeof n.data?.clientId === 'string' ? n.data.clientId : null;
  if (clientId && /^[0-9a-f-]{36}$/i.test(clientId)) return `/o/${orgSlug}/clients/${clientId}`;
  if (n.data?.workouts === '1') return `/o/${orgSlug}/workouts`;
  return `/o/${orgSlug}`;
}

export const UNREAD_KEY = ['notifications', 'unread-count'] as const;
