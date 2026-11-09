'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppNotification } from '@pt/api-client';
import { Bell } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { UNREAD_KEY, notificationHref } from './notification-link';

/** Bell in the application header: an unread badge (refreshed every minute) and the latest notifications. */
export function NotificationBell() {
  const t = useTranslations('inbox');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = useQuery({ queryKey: UNREAD_KEY, queryFn: () => api.me.notifications.unreadCount(), refetchInterval: 60_000, staleTime: 30_000 });
  const latest = useQuery({ queryKey: ['notifications', 'latest'], queryFn: () => api.me.notifications.list({ limit: 6 }), enabled: open });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
  const markRead = useMutation({ mutationFn: (id: string) => api.me.notifications.markRead(id), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => api.me.notifications.markAllRead(), onSuccess: refresh });

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = unread.data ?? 0;
  const go = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    const href = notificationHref(n);
    if (href) router.push(href);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={count > 0 ? `${t('open')}. ${t('unread', { count })}` : t('open')}
        className="relative grid size-9 place-items-center rounded-md text-ink-2 hover:bg-surface-2"
      >
        <Bell className="size-5" aria-hidden />
        {count > 0 && <span aria-hidden className="absolute end-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.65rem] font-semibold leading-4 text-danger-soft">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div role="menu" className="anim-pop absolute end-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
            <p className="text-sm font-semibold">{t('title')}</p>
            {count > 0 && <button type="button" className="text-xs font-medium text-link hover:underline" onClick={() => markAll.mutate()}>{t('markAllRead')}</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {latest.isPending && <p className="px-3.5 py-6 text-center text-sm text-muted">…</p>}
            {latest.data?.data.length === 0 && <p className="px-3.5 py-6 text-center text-sm text-muted">{t('empty')}</p>}
            <ul className="divide-y divide-line">
              {latest.data?.data.map((n) => (
                <li key={n.id}>
                  <button type="button" role="menuitem" onClick={() => go(n)} className={cn('block w-full px-3.5 py-3 text-start hover:bg-surface-2', !n.readAt && 'bg-selection/40')}>
                    <span className="flex items-start gap-2">
                      {!n.readAt && <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{n.title}</span>
                        <span className="block text-sm text-ink-2">{n.body}</span>
                        <span className="mt-0.5 block text-xs text-muted">{format.relativeTime(new Date(n.createdAt), now)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-3.5 py-2.5 text-center text-sm font-medium text-link hover:bg-surface-2">{t('viewAll')}</Link>
        </div>
      )}
    </div>
  );
}
