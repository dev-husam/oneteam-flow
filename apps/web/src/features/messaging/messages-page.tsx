'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conversation } from '@pt/api-client';
import { MessageSquarePlus, MessagesSquare, Search } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useErrorMessage } from '@/lib/errors';
import { useOrg } from '@/lib/org/org-context';
import { useCursorList } from '@/lib/use-cursor-list';
import { useDebounced } from '@/lib/use-debounced';
import { isSameDay } from './messages-cache';
import { messagingKey } from './realtime-provider';
import { Thread } from './thread';

/** "14:05" today, "Nov 6" earlier. */
export function useWhen() {
  const format = useFormatter();
  return (iso: string): string => {
    const d = new Date(iso);
    return isSameDay(d, new Date()) ? format.dateTime(d, { timeStyle: 'short' }) : format.dateTime(d, { dateStyle: 'medium' });
  };
}

function NewConversation({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: (c: Conversation) => void }) {
  const t = useTranslations('messaging');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { orgId } = useOrg();
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim(), 250);
  const contacts = useCursorList(messagingKey(orgId, 'contacts', search), (cursor) => api.org(orgId).messaging.contacts({ q: search || undefined, cursor, limit: 30 }), open);
  const start = useMutation({
    mutationFn: (membershipId: string) => api.org(orgId).messaging.conversations.start(membershipId),
    onSuccess: (c) => onStarted(c),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Dialog open={open} onClose={onClose} title={t('newTitle')}>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('searchPeople')} className="ps-9" autoFocus />
        </div>
        {contacts.isPending && <Skeleton className="h-24" />}
        {contacts.isError && <ErrorAlert error={contacts.error} />}
        {!contacts.isPending && !contacts.isError && contacts.items.length === 0 && (
          <div className="py-6 text-center">
            <p className="font-medium">{t('noContacts')}</p>
            <p className="text-sm text-muted">{t('noContactsBody')}</p>
          </div>
        )}
        <ul className="max-h-72 divide-y divide-line overflow-y-auto">
          {contacts.items.map((c) => (
            <li key={c.membershipId}>
              <button type="button" onClick={() => start.mutate(c.membershipId)} disabled={start.isPending} className="flex w-full items-center gap-3 px-2 py-2.5 text-start hover:bg-surface-2 disabled:opacity-60">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-selection text-sm font-semibold text-link" aria-hidden>{c.fullName.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{c.fullName}</span>
              </button>
            </li>
          ))}
        </ul>
        {contacts.hasNextPage && <Button variant="secondary" size="sm" loading={contacts.isFetchingNextPage} onClick={() => void contacts.fetchNextPage()}>{t('loadEarlier')}</Button>}
      </div>
    </Dialog>
  );
}

function ConversationRow({ c, selected, onSelect }: { c: Conversation; selected: boolean; onSelect: () => void }) {
  const t = useTranslations('messaging');
  const when = useWhen();
  const preview = c.lastMessage ? (c.lastMessage.deleted ? t('deleted') : c.lastMessage.preview || (c.lastMessage.hasAttachments ? t('attachments') : '')) : t('startedBy');
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={cn('flex w-full items-center gap-3 border-b border-line px-4 py-3 text-start transition-colors hover:bg-surface-2', selected && 'bg-selection')}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-ink-2" aria-hidden>{(c.other?.fullName ?? '?').slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn('min-w-0 flex-1 truncate', c.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>{c.other?.fullName ?? '—'}</span>
            {c.lastMessage && <span className="shrink-0 text-xs text-muted">{when(c.lastMessage.createdAt)}</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-sm', c.unreadCount > 0 ? 'text-ink' : 'text-muted')}>{preview}</span>
            {c.unreadCount > 0 && <span aria-label={t('unread', { count: c.unreadCount })} className="rounded-full bg-accent px-1.5 text-[0.7rem] font-semibold leading-5 text-accent-ink tabular-nums">{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Private conversations: the list on one side, the open thread on the other (one at a time on a phone). */
export function MessagesPage() {
  const t = useTranslations('messaging');
  const { orgId } = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const selected = params.get('c');
  const list = useQuery({ queryKey: messagingKey(orgId, 'conversations'), queryFn: () => api.org(orgId).messaging.conversations.list() });
  const select = (id: string | null) => router.replace(id ? `${pathname}?c=${id}` : pathname);
  const current = list.data?.find((c) => c.id === selected);

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<Button onClick={() => setNewOpen(true)}><MessageSquarePlus className="size-4" aria-hidden />{t('newMessage')}</Button>} />
      <div className="anim-rise grid min-h-[28rem] overflow-hidden rounded-lg border border-line bg-surface lg:h-[calc(100dvh-13rem)] lg:grid-cols-[20rem_1fr]">
        <aside className={cn('min-h-0 overflow-y-auto border-line lg:block lg:border-e', selected && 'hidden')} aria-label={t('title')}>
          {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
          {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
          {list.data && list.data.length === 0 && <EmptyState icon={MessagesSquare} title={t('empty')}>{t('emptyBody')}</EmptyState>}
          {list.data && list.data.length > 0 && (
            <ul>
              {list.data.map((c) => <ConversationRow key={c.id} c={c} selected={c.id === selected} onSelect={() => select(c.id)} />)}
            </ul>
          )}
        </aside>
        <section className={cn('min-h-0 min-w-0 lg:flex', selected ? 'flex' : 'hidden')}>
          {selected ? (
            <Thread key={selected} conversationId={selected} conversation={current} onBack={() => select(null)} />
          ) : (
            <div className="grid w-full place-items-center p-8 text-center text-muted"><p>{t('pickOne')}</p></div>
          )}
        </section>
      </div>
      <NewConversation
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onStarted={(c) => {
          setNewOpen(false);
          void queryClient.invalidateQueries({ queryKey: messagingKey(orgId, 'conversations') });
          select(c.id);
        }}
      />
    </>
  );
}
