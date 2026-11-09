'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { withMessage, type Conversation, type Message, type MessageAttachmentInfo, type MessagePagesLike } from '@pt/api-client';
import { MESSAGE_MAX_ATTACHMENTS, MESSAGE_MAX_LENGTH, checkUpload } from '@pt/domain';
import { ArrowLeft, Ban, Bell, BellOff, FileText, Paperclip, Send, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useErrorMessage } from '@/lib/errors';
import { useOrg } from '@/lib/org/org-context';
import { useCursorList } from '@/lib/use-cursor-list';
import { useWhen } from './messages-page';
import { ReportDialog } from './report-dialog';
import { messagingKey, useRealtimeStatus } from './realtime-provider';

/** A file attached to a message: pictures are shown, other files open in a new tab. The link is requested only when needed. */
function Attachment({ a }: { a: MessageAttachmentInfo }) {
  const t = useTranslations('messaging');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { orgId } = useOrg();
  const isImage = a.mimeType.startsWith('image/') && a.mimeType !== 'image/heic';
  const link = useQuery({ queryKey: ['message-file', orgId, a.fileId], queryFn: () => api.org(orgId).files.downloadUrl(a.fileId), enabled: isImage, staleTime: 30_000, gcTime: 30_000, retry: false });
  const open = useMutation({
    mutationFn: () => api.org(orgId).files.downloadUrl(a.fileId),
    onSuccess: ({ url }) => window.open(url, '_blank', 'noopener,noreferrer'),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (isImage && link.data) {
    return (
      <a href={link.data.url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={link.data.url} alt={a.fileName} loading="lazy" className="max-h-56 rounded-md border border-line object-cover" />
      </a>
    );
  }
  return (
    <button type="button" onClick={() => open.mutate()} disabled={open.isPending} className="flex max-w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-start text-sm text-ink hover:bg-surface-2">
      <FileText className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 truncate">{a.fileName}</span>
      <span className="shrink-0 text-xs text-muted">{t('download')}</span>
    </button>
  );
}

function Bubble({ m, mine, onDelete, onReport }: { m: Message; mine: boolean; onDelete: () => void; onReport: () => void }) {
  const t = useTranslations('messaging');
  const when = useWhen();
  return (
    <li className={cn('flex max-w-[85%] flex-col gap-1', mine ? 'ms-auto items-end' : 'me-auto items-start')}>
      <div className={cn('space-y-2 rounded-lg px-3 py-2', m.deleted ? 'border border-dashed border-line text-muted italic' : mine ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink')}>
        {m.deleted ? <p className="text-sm">{t('deleted')}</p> : m.body && <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>}
        {m.attachments.length > 0 && <div className="space-y-2">{m.attachments.map((a) => <Attachment key={a.fileId} a={a} />)}</div>}
      </div>
      <span className="flex items-center gap-2 text-xs text-muted">
        {when(m.createdAt)}
        {mine && !m.deleted && <ConfirmButton size="sm" variant="ghost" className="h-6 px-1.5 text-xs" confirmLabel={t('deleteConfirm')} onConfirm={onDelete}>{t('deleteMessage')}</ConfirmButton>}
        {!mine && !m.deleted && <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={onReport}>{t('report')}</Button>}
      </span>
    </li>
  );
}

function Composer({ conversationId, onSent }: { conversationId: string; onSent: (m: Message) => void }) {
  const t = useTranslations('messaging');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { orgId } = useOrg();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // the box grows with what is typed, up to a few lines
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const send = useMutation({
    mutationFn: () => api.org(orgId).messaging.conversations.send(conversationId, { body: text.trim() || undefined, fileIds: files.length ? files.map((f) => f.id) : undefined }),
    onSuccess: (m) => { setText(''); setFiles([]); onSent(m); },
    onError: (e) => toast(errorMessage(e) || t('sendFailed'), 'error'),
  });
  const empty = text.trim().length === 0 && files.length === 0;
  const tooLong = text.length > MESSAGE_MAX_LENGTH;

  async function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    const chosen = [...list];
    if (files.length + chosen.length > MESSAGE_MAX_ATTACHMENTS) return toast(t('tooManyFiles', { count: MESSAGE_MAX_ATTACHMENTS }), 'error');
    if (chosen.some((f) => !checkUpload(f.type, f.size).ok)) return toast(t('fileNotAllowed'), 'error');
    setUploading(true);
    try {
      for (const file of chosen) {
        const stored = await api.org(orgId).files.upload({ fileName: file.name, mimeType: file.type, body: file, sensitivity: 'STANDARD' });
        setFiles((prev) => [...prev, { id: stored.id, name: file.name }]);
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <form
      className="space-y-2 border-t border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!empty && !tooLong && !send.isPending && !uploading) send.mutate();
      }}
    >
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('attachments')}>
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm">
              <FileText className="size-3.5 text-muted" aria-hidden />
              <span className="max-w-40 truncate">{f.name}</span>
              <button type="button" aria-label={t('removeAttachment')} onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))} className="text-muted hover:text-ink"><X className="size-3.5" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <input ref={input} type="file" multiple hidden onChange={(e) => void pick(e.target.files)} />
        <Button variant="ghost" size="icon" aria-label={t('attach')} title={t('attach')} loading={uploading} onClick={() => input.current?.click()}><Paperclip className="size-4" aria-hidden /></Button>
        <Textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={t('typeMessage')}
          aria-label={t('typeMessage')}
          rows={1}
          invalid={tooLong}
          className="max-h-40 min-h-10 flex-1 resize-none"
        />
        <Button type="submit" loading={send.isPending} disabled={empty || tooLong || uploading}><Send className="size-4 rtl:-scale-x-100" aria-hidden />{t('send')}</Button>
      </div>
      {tooLong && <p className="text-xs text-danger" role="alert">{t('tooLong')}</p>}
    </form>
  );
}

/** One open conversation: messages (oldest at the top), the composer, and the read marker that follows what you actually see. */
export function Thread({ conversationId, conversation, onBack }: { conversationId: string; conversation: Conversation | undefined; onBack: () => void }) {
  const t = useTranslations('messaging');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const status = useRealtimeStatus();
  const { orgId, membershipId } = useOrg();
  const key = messagingKey(orgId, 'messages', conversationId);
  const list = useCursorList(key, (cursor) => api.org(orgId).messaging.conversations.messages(conversationId, { cursor, limit: 30 }));
  const end = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLUListElement>(null);
  const stuck = useRef(true);
  const ordered = [...list.items].reverse();
  const newest = list.items[0];
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: messagingKey(orgId, 'conversations') });
    void queryClient.invalidateQueries({ queryKey: messagingKey(orgId, 'unread') });
  };

  const read = useMutation({ mutationFn: () => api.org(orgId).messaging.conversations.read(conversationId), onSuccess: refresh });
  const unread = conversation?.unreadCount ?? 0;
  const markRead = read.mutate;
  useEffect(() => {
    if (!newest || unread === 0 || newest.senderMembershipId === membershipId) return;
    const go = () => { if (!document.hidden) markRead(); };
    go();
    document.addEventListener('visibilitychange', go);
    return () => document.removeEventListener('visibilitychange', go);
  }, [newest?.id, unread, membershipId, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the conversation while the reader is at the bottom, including when a picture finishes loading and the list grows.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
    stuck.current = true;
  }, [newest?.id]);
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { if (stuck.current) end.current?.scrollIntoView({ block: 'end' }); });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const block = useMutation({
    mutationFn: (blocked: boolean) => api.org(orgId).messaging.conversations.block(conversationId, blocked),
    onSuccess: (_c, blocked) => { toast(blocked ? t('blocked') : t('unblocked'), 'success'); refresh(); void queryClient.invalidateQueries({ queryKey: messagingKey(orgId, 'contacts') }); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const [reporting, setReporting] = useState<Message | null>(null);
  const mute = useMutation({
    mutationFn: () => api.org(orgId).messaging.conversations.mute(conversationId, !conversation?.muted),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: (messageId: string) => api.org(orgId).messaging.conversations.deleteMessage(conversationId, messageId),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t('back')} onClick={onBack}><ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{conversation?.other?.fullName ?? '…'}</h2>
          <p className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
            <span className={cn('size-1.5 rounded-full', status === 'live' ? 'bg-ok' : 'bg-muted')} aria-hidden />
            {status === 'live' ? t('liveOn') : t('liveOff')}
          </p>
        </div>
        {conversation && !conversation.blockedByMe && (
          <ConfirmButton variant="ghost" size="sm" aria-label={t('block')} title={t('block')} confirmLabel={t('blockNow')} loading={block.isPending} onConfirm={() => block.mutate(true)}><Ban className="size-4" aria-hidden /><span className="hidden xl:inline">{t('block')}</span></ConfirmButton>
        )}
        {conversation && (
          <Button variant="ghost" size="sm" loading={mute.isPending} onClick={() => mute.mutate()} aria-pressed={conversation.muted} aria-label={conversation.muted ? t('unmute') : t('mute')} title={conversation.muted ? t('unmute') : t('mute')}>
            {conversation.muted ? <BellOff className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />}
            <span className="hidden xl:inline">{conversation.muted ? t('unmute') : t('mute')}</span>
          </Button>
        )}
      </header>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto p-4"
        role="log"
        aria-label={t('title')}
        onScroll={(e) => { const el = e.currentTarget; stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}
      >
        {list.isPending && <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="ms-auto h-10 w-1/2" /></div>}
        {list.isError && <ErrorAlert error={list.error} />}
        {list.hasNextPage && <div className="mb-3 text-center"><Button variant="secondary" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{t('loadEarlier')}</Button></div>}
        {!list.isPending && !list.isError && ordered.length === 0 && <p className="py-10 text-center text-sm text-muted">{t('noMessages')}</p>}
        <ul ref={content} className="flex flex-col gap-3">
          {ordered.map((m) => <Bubble key={m.id} m={m} mine={m.senderMembershipId === membershipId} onDelete={() => remove.mutate(m.id)} onReport={() => setReporting(m)} />)}
        </ul>
        <div ref={end} />
      </div>
      <ReportDialog conversationId={conversationId} message={reporting} onClose={() => setReporting(null)} />
      {conversation && !conversation.canSend ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line p-3 text-sm text-muted" role="status">
          <span className="flex-1">{conversation.blockedByMe ? t('blockedByMe') : t('cannotSend')}</span>
          {conversation.blockedByMe && <Button variant="secondary" size="sm" loading={block.isPending} onClick={() => block.mutate(false)}>{t('unblock')}</Button>}
        </div>
      ) : (
      <Composer
        conversationId={conversationId}
        onSent={(m) => {
          queryClient.setQueryData<MessagePagesLike>(key, (old) => withMessage(old, m));
          refresh();
        }}
      />
      )}
    </div>
  );
}
