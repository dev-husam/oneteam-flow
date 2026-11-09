'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppNotification, NotificationCategory, NotificationChannel } from '@pt/api-client';
import { BellOff } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useErrorMessage } from '@/lib/errors';
import { useCursorList } from '@/lib/use-cursor-list';
import { notificationHref } from './notification-link';

const CHANNELS: NotificationChannel[] = ['IN_APP', 'PUSH', 'EMAIL'];

function Preferences() {
  const t = useTranslations('inbox');
  const labels = useTranslations('notifications');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: ['notifications', 'preferences'], queryFn: () => api.me.notifications.preferences() });
  const set = useMutation({
    mutationFn: (v: { category: NotificationCategory; channel: NotificationChannel; enabled: boolean }) => api.me.notifications.setPreference(v),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] }); toast(t('saved')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Card className="anim-rise">
      <CardHeader>
        <CardTitle>{t('preferences')}</CardTitle>
        <CardDescription>{t('preferencesBody')}</CardDescription>
      </CardHeader>
      <CardBody>
        {prefs.isPending && <Skeleton className="h-24" />}
        {prefs.isError && <ErrorAlert error={prefs.error} />}
        {prefs.data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead>
                <tr className="text-start text-xs font-medium text-muted">
                  <th scope="col" className="py-2 pe-4 text-start font-medium">{t('category')}</th>
                  {CHANNELS.map((c) => <th key={c} scope="col" className="px-3 py-2 text-start font-medium">{labels(`channels.${c}` as 'channels.IN_APP')}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {prefs.data.map((p) => (
                  <tr key={p.category}>
                    <th scope="row" className="py-3 pe-4 text-start font-medium">{labels(`categories.${p.category}` as 'categories.tasks')}</th>
                    {CHANNELS.map((c) => (
                      <td key={c} className="px-3 py-3">
                        <Checkbox
                          label={<span className="sr-only">{`${labels(`categories.${p.category}` as 'categories.tasks')}: ${labels(`channels.${c}` as 'channels.IN_APP')}`}</span>}
                          checked={p.channels[c]}
                          disabled={set.isPending}
                          onChange={(e) => set.mutate({ category: p.category, channel: c, enabled: e.target.checked })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">{t('inAppNote')}</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function NotificationRow({ n, onRead }: { n: AppNotification; onRead: (id: string) => void }) {
  const t = useTranslations('inbox');
  const format = useFormatter();
  const href = notificationHref(n);
  const body = (
    <span className="flex items-start gap-3">
      <span aria-hidden className={cn('mt-2 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-accent')} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{n.title}</span>
        <span className="block text-sm text-ink-2">{n.body}</span>
        <span className="mt-0.5 block text-xs text-muted">{format.dateTime(new Date(n.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}</span>
      </span>
    </span>
  );
  return (
    <li className={cn('flex items-start gap-2 px-5 py-3.5', !n.readAt && 'bg-selection/30')}>
      <div className="min-w-0 flex-1">
        {href ? <Link href={href} onClick={() => { if (!n.readAt) onRead(n.id); }} className="block hover:text-link">{body}</Link> : body}
      </div>
      {!n.readAt && <Button size="sm" variant="ghost" onClick={() => onRead(n.id)}>{t('markRead')}</Button>}
    </li>
  );
}

export function NotificationsPage() {
  const t = useTranslations('inbox');
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const list = useCursorList(['notifications', 'list', unreadOnly], (cursor) => api.me.notifications.list({ unread: unreadOnly || undefined, cursor, limit: 25 }));
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['notifications'] }); };
  const markRead = useMutation({ mutationFn: (id: string) => api.me.notifications.markRead(id), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => api.me.notifications.markAllRead(), onSuccess: refresh });

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<Button variant="secondary" loading={markAll.isPending} onClick={() => markAll.mutate()}>{t('markAllRead')}</Button>} />
      <div className="space-y-6">
        <Card className="anim-rise">
          <div className="border-b border-line p-4"><Checkbox label={t('unreadOnly')} checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /></div>
          {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
          {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
          {!list.isPending && !list.isError && list.items.length === 0 && <EmptyState icon={BellOff} title={t('empty')}>{t('emptyBody')}</EmptyState>}
          {list.items.length > 0 && <ul className="divide-y divide-line">{list.items.map((n) => <NotificationRow key={n.id} n={n} onRead={(id) => markRead.mutate(id)} />)}</ul>}
          <LoadMore hasNextPage={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
        </Card>
        <Preferences />
      </div>
    </>
  );
}
