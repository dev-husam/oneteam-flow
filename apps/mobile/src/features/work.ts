import type { ActivityItem, AppNotification, Exercise, MetricDefinition } from '@pt/api-client';
import type { Translator } from '@/i18n';

/** Where tapping a notification leads, from the small deep-link payload the server attached (never a URL). */
export function notificationRoute(n: Pick<AppNotification, 'data'>): string | null {
  const taskId = typeof n.data?.taskId === 'string' ? n.data.taskId : null;
  if (taskId && /^[0-9a-f-]{36}$/i.test(taskId)) return `/(app)/task/${taskId}`;
  if (typeof n.data?.goalId === 'string') return '/(app)/(tabs)/progress';
  const clientId = typeof n.data?.clientId === 'string' ? n.data.clientId : null;
  if (clientId && /^[0-9a-f-]{36}$/i.test(clientId)) return `/(app)/client/${clientId}`;
  const checkinId = typeof n.data?.checkinId === 'string' ? n.data.checkinId : null;
  if (checkinId && /^[0-9a-f-]{36}$/i.test(checkinId)) return `/(app)/checkins/${checkinId}`;
  const conversationId = typeof n.data?.conversationId === 'string' ? n.data.conversationId : null;
  if (conversationId && /^[0-9a-f-]{36}$/i.test(conversationId)) return `/(app)/conversation/${conversationId}`;
  if (n.data?.coaching === 'client') return '/(app)/my-coaching';
  const coachClientId = typeof n.data?.coachClientId === 'string' ? n.data.coachClientId : null;
  if (coachClientId && /^[0-9a-f-]{36}$/i.test(coachClientId)) return `/(app)/coaching-client/${coachClientId}`;
  if (n.data?.coaching === 'coach') return '/(app)/coaching';
  if (n.data?.checkin === '1') return '/(app)/my-checkin';
  if (n.data?.nutrition === '1') return '/(app)/(tabs)/nutrition';
  if (n.data?.workouts === '1') return '/(app)/(tabs)/workouts';
  return null;
}

/** A plain calendar date (YYYY-MM-DD) moved by whole days, with no time zone involved. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "task.commented" → "Tariq commented", in the user's language; unknown verbs get a neutral sentence. */
export function activityText(t: Translator, item: Pick<ActivityItem, 'verb' | 'actorName'>): string {
  const actor = item.actorName ?? t('activity.someone');
  const key = `activity.verb.${item.verb.replaceAll('.', '_')}`;
  return t.has(key) ? t(key, { actor }) : t('activity.unknown', { actor });
}

export const formatDate = (iso: string, locale: string): string =>
  new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium' });

export const formatShortDate = (iso: string, locale: string): string =>
  new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar' : 'en', { month: 'short', day: 'numeric' });

export const formatDateTime = (iso: string, locale: string): string =>
  new Date(iso).toLocaleString(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' });

/** A number in the metric's precision, without trailing zeros. */
export const formatValue = (v: number, precision: number, locale: string): string =>
  v.toLocaleString(locale === 'ar' ? 'ar' : 'en', { maximumFractionDigits: precision });

/** Exercise name in the user's language; seeded exercises are bilingual, custom ones fall back to English. */
export const exerciseName = (e: Pick<Exercise, 'name'>, locale: string): string => (locale === 'ar' && e.name.ar ? e.name.ar : e.name.en);

/** Built-in measurements are translated by key; an organization's own keeps its name. */
export function metricName(t: Translator, m: Pick<MetricDefinition, 'key' | 'name' | 'system'>): string {
  const key = `fitness.metric.${m.key}`;
  return m.system && t.has(key) ? t(key) : m.name;
}
