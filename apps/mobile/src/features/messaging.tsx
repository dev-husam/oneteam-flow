import { useQuery, useQueryClient } from '@tanstack/react-query';
import { connectRealtime, withDeleted, withMessage, type MessagePagesLike, type RealtimeEvent, type RealtimeStatus } from '@pt/api-client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useOrgContext } from '@/features/org';
import { API_URL, api } from '@/lib/api';

export const messagingKey = (orgId: string, ...rest: unknown[]) => ['org', orgId, 'messaging', ...rest] as const;
const RealtimeCtx = createContext<{ status: RealtimeStatus }>({ status: 'offline' });
export const useRealtimeStatus = () => useContext(RealtimeCtx).status;

/** Unread messages in the active organization, for the tab badge. The socket keeps it fresh; the interval is a safety net. */
export function useUnreadMessages(): number {
  const { orgId, can } = useOrgContext();
  const q = useQuery({
    queryKey: messagingKey(orgId ?? 'none', 'unread'),
    queryFn: () => api.org(orgId!).messaging.unreadCount(),
    enabled: Boolean(orgId) && can('message.send'),
    refetchInterval: 120_000,
  });
  return q.data?.count ?? 0;
}

/**
 * One server-push connection while the app is in the foreground and the person has messaging in this organization.
 * Backgrounding closes it (the phone would kill it anyway); coming back reconnects and reloads what is on screen.
 * Every pushed event becomes a cache update, so open screens change without a refresh.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { orgId, context, can } = useOrgContext();
  const queryClient = useQueryClient();
  const membershipId = context?.membership.id;
  const enabled = Boolean(orgId) && Boolean(membershipId) && can('message.send');
  // "inactive" is a brief iOS state (control centre, app switcher): only a real background closes the connection
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const [status, setStatus] = useState<RealtimeStatus>('offline');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s !== 'background'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !foreground || !orgId) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: messagingKey(orgId, 'conversations') });
      void queryClient.invalidateQueries({ queryKey: messagingKey(orgId, 'unread') });
    };
    const onEvent = (e: RealtimeEvent) => {
      if (e.organizationId !== orgId) return; // one socket carries all of the person's organizations
      if (e.type === 'message:new') {
        queryClient.setQueryData<MessagePagesLike>(messagingKey(orgId, 'messages', e.conversationId), (old) => withMessage(old, e.message));
        refresh();
      } else if (e.type === 'message:deleted') {
        queryClient.setQueryData<MessagePagesLike>(messagingKey(orgId, 'messages', e.conversationId), (old) => withDeleted(old, e.messageId));
        refresh();
      } else if (e.membershipId === membershipId) {
        refresh(); // read on another device
      }
    };
    const connection = connectRealtime({
      baseUrl: API_URL,
      getToken: (renew) => api.accessTokenForRealtime(renew),
      onEvent,
      onStatus: (s) => {
        setStatus(s);
        if (s === 'live') {
          refresh(); // events sent while offline are not replayed
          void queryClient.invalidateQueries({ queryKey: messagingKey(orgId, 'messages') });
        }
      },
    });
    return () => {
      connection.close();
      setStatus('offline');
    };
  }, [enabled, foreground, orgId, membershipId, queryClient]);

  const value = useMemo(() => ({ status }), [status]);
  return <RealtimeCtx.Provider value={value}>{children}</RealtimeCtx.Provider>;
}
