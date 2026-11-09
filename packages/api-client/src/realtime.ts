import { io, type Socket } from 'socket.io-client';
import type { RealtimeEvent, RealtimeStatus } from './types.js';

const EVENTS = ['message:new', 'message:deleted', 'conversation:read'] as const;

export interface RealtimeOptions {
  /** The API address (e.g. http://localhost:3001/api/v1) or just its origin: only the origin is used. */
  baseUrl: string;
  /** A token for the handshake. `renew` asks for a freshly refreshed one. Null means the person is signed out. */
  getToken: (renew: boolean) => Promise<string | null>;
  onEvent: (event: RealtimeEvent) => void;
  /** `live` fires on every (re)connection: refetch what you show, events sent while offline were not replayed. */
  onStatus?: (status: RealtimeStatus) => void;
  /** Test seam. */
  createSocket?: (url: string, auth: { token: string }) => Pick<Socket, 'on' | 'once' | 'close' | 'removeAllListeners'>;
  /** Test seam: delay before the n-th reconnection attempt (ms). */
  backoff?: (attempt: number) => number;
}

const defaultBackoff = (attempt: number): number => Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5)) * (0.75 + Math.random() * 0.5);

/**
 * Keeps one authenticated server-push connection alive for the signed-in person: reconnects with backoff, asks for a
 * fresh token when the server refuses or expires the old one, and stops for good when the person is signed out.
 * The token goes in the handshake `auth` (never in the URL) and the connection only ever listens.
 */
export function connectRealtime(opts: RealtimeOptions): { close: () => void } {
  const origin = new URL(opts.baseUrl).origin;
  const backoff = opts.backoff ?? defaultBackoff;
  const create = opts.createSocket ?? ((url, auth) => io(url, { auth, transports: ['websocket'], reconnection: false, forceNew: true }));
  let closed = false;
  let attempt = 0;
  let renew = false;
  let socket: ReturnType<typeof create> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const status = (s: RealtimeStatus) => {
    if (!closed) opts.onStatus?.(s);
  };

  const schedule = (needsRenew: boolean) => {
    if (closed) return;
    renew ||= needsRenew;
    status('offline');
    timer = setTimeout(() => void open(), backoff(attempt));
    attempt += 1;
  };

  async function open(): Promise<void> {
    if (closed) return;
    status('connecting');
    const token = await opts.getToken(renew).catch(() => null);
    if (closed) return;
    if (!token) return status('offline'); // signed out: nothing to reconnect with
    renew = false;
    const current = create(origin, { token });
    socket = current;
    let settled = false;
    const lost = (needsRenew: boolean) => {
      if (settled || closed) return;
      settled = true;
      current.removeAllListeners();
      current.close();
      schedule(needsRenew);
    };
    current.once('ready', () => {
      attempt = 0;
      status('live');
    });
    current.on('connect_error', (err: Error & { data?: { code?: string } }) => lost(err.data?.code === 'UNAUTHENTICATED'));
    current.on('auth:expired', () => lost(true));
    current.on('disconnect', () => lost(false));
    for (const type of EVENTS) current.on(type, (payload: object) => opts.onEvent({ type, ...payload } as RealtimeEvent));
  }

  void open();
  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.removeAllListeners();
      socket?.close();
    },
  };
}
