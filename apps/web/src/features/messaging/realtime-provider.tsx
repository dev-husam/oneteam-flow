'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { connectRealtime, withDeleted, withMessage, type MessagePagesLike, type RealtimeEvent, type RealtimeStatus } from '@pt/api-client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { orgKey, useOrg } from '@/lib/org/org-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const RealtimeCtx = createContext<{ status: RealtimeStatus }>({ status: 'offline' });

export const useRealtimeStatus = () => useContext(RealtimeCtx).status;
export const messagingKey = (orgId: string, ...rest: unknown[]) => orgKey(orgId, 'messaging', ...rest);

/** Unread messages in this organization, for the sidebar badge. Kept fresh by the socket; the interval is only a safety net. */
export function useUnreadMessages(): number {
  const { orgId, can } = useOrg();
  const q = useQuery({ queryKey: messagingKey(orgId, 'unread'), queryFn: () => api.org(orgId).messaging.unreadCount(), enabled: can('message.send'), refetchInterval: 120_000 });
  return q.data?.count ?? 0;
}

/**
 * Keeps one realtime connection while the person is inside an organization that has messaging for them, and turns
 * each pushed event into a cache update, so open screens change without a reload. Offline = everything still works,
 * it just refreshes on the next request (and on every reconnection).
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { orgId, membershipId, can } = useOrg();
  const queryClient = useQueryClient();
  const enabled = can('message.send');
  const [status, setStatus] = useState<RealtimeStatus>('offline');

  useEffect(() => {
    if (!enabled) return;
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
        refresh(); // I read it on another device
      }
    };
    const connection = connectRealtime({
      baseUrl: API_URL,
      getToken: (renew) => api.accessTokenForRealtime(renew),
      onEvent,
      onStatus: (s) => {
        setStatus(s);
        if (s === 'live') {
          // events sent while offline are not replayed: reload what is on screen
          refresh();
          void queryClient.invalidateQueries({ queryKey: messagingKey(orgId, 'messages') });
        }
      },
    });
    return () => connection.close();
  }, [enabled, orgId, membershipId, queryClient]);

  const value = useMemo(() => ({ status: enabled ? status : ('offline' as const) }), [enabled, status]);
  return <RealtimeCtx.Provider value={value}>{children}</RealtimeCtx.Provider>;
}
