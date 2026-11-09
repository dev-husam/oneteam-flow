import { Inject, Logger, OnApplicationShutdown } from '@nestjs/common';
import { OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenService } from '../../../core/auth/token.service.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { RealtimeService, memberRoom, sessionRoom, userRoom } from './realtime.service.js';

/** How often connected sockets are re-checked against the database (revoked session, suspended user, removed member). */
export const REVALIDATE_MS = 30_000;
const MAX_SOCKETS_PER_USER = 10;
const MEMBER_ROOM = /^org:[^:]+:member:[^:]+$/;

interface SocketData {
  userId: string;
  sessionId: string;
  /** Epoch seconds when the access token stops being valid. */
  exp: number;
  rooms: string[];
}

const refuse = (code: string): Error => Object.assign(new Error(code), { data: { code } });

/**
 * Server-to-client push only. The connection is authenticated with the same access token as the REST API (sent in the
 * handshake `auth`, never in the URL), and the server alone decides which private rooms the socket joins: those of the
 * user's own ACTIVE memberships. The client cannot join a room, and every event it might send is refused.
 */
@WebSocketGateway({ path: '/socket.io' })
export class RealtimeGateway implements OnGatewayInit, OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeGateway.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
    server.use((socket, next) => {
      this.authenticate(socket).then(() => next(), (err: unknown) => next(err instanceof Error && 'data' in err ? err : refuse('UNAUTHENTICATED')));
    });
    server.on('connection', (socket) => this.onConnection(socket));
    this.timer = setInterval(() => void this.revalidate().catch((e: unknown) => this.logger.warn(`revalidate failed: ${String(e)}`)), REVALIDATE_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async authenticate(socket: Socket): Promise<void> {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token !== 'string' || auth.token.length === 0) throw refuse('UNAUTHENTICATED');
    let claims;
    try {
      claims = await this.tokens.verifyAccessToken(auth.token);
    } catch {
      throw refuse('UNAUTHENTICATED');
    }
    const session = await this.prisma.userSession.findUnique({ where: { id: claims.sid }, include: { user: { select: { status: true, emailVerifiedAt: true } } } });
    if (!session || session.userId !== claims.sub || session.revokedAt || session.user.status !== 'ACTIVE' || !session.user.emailVerifiedAt) throw refuse('UNAUTHENTICATED');

    const open = await this.realtime.io!.in(userRoom(claims.sub)).fetchSockets();
    if (open.length >= MAX_SOCKETS_PER_USER) throw refuse('TOO_MANY_CONNECTIONS');

    const memberships = await this.activeMemberships(claims.sub);
    socket.data = { userId: claims.sub, sessionId: claims.sid, exp: claims.exp, rooms: [userRoom(claims.sub), sessionRoom(claims.sid), ...memberships.map((m) => memberRoom(m.organizationId, m.id))] } satisfies SocketData;
  }

  private activeMemberships(userId: string) {
    return this.prisma.membership.findMany({ where: { userId, status: 'ACTIVE', organization: { status: 'ACTIVE' } }, select: { id: true, organizationId: true } });
  }

  private onConnection(socket: Socket): void {
    const data = socket.data as SocketData;
    void socket.join(data.rooms);

    // Clients only listen. Anything they send is refused; a socket that keeps trying is dropped.
    let violations = 0;
    socket.use((_packet, next) => {
      violations += 1;
      if (violations > 5) socket.disconnect(true);
      next(refuse('NOT_SUPPORTED'));
    });

    const ms = Math.min(Math.max(data.exp * 1000 - Date.now(), 0), 2_147_000_000);
    const expiry = setTimeout(() => {
      socket.emit('auth:expired');
      socket.disconnect(true);
    }, ms);
    socket.on('disconnect', () => clearTimeout(expiry));
    socket.emit('ready', { memberships: data.rooms.length - 2 });
  }

  /**
   * Bring every connected socket (on any API instance) in line with the database: drop sockets of revoked sessions or
   * suspended users, leave the rooms of memberships that ended, join the rooms of new ones. Runs on a timer; callable in tests.
   */
  async revalidate(): Promise<void> {
    const io = this.realtime.io;
    if (!io) return;
    const sockets = await io.fetchSockets();
    if (sockets.length === 0) return;
    const sessionIds = [...new Set(sockets.map((s) => (s.data as SocketData).sessionId))];
    const userIds = [...new Set(sockets.map((s) => (s.data as SocketData).userId))];
    const [sessions, memberships] = await Promise.all([
      this.prisma.userSession.findMany({ where: { id: { in: sessionIds } }, select: { id: true, revokedAt: true, user: { select: { status: true } } } }),
      this.prisma.membership.findMany({ where: { userId: { in: userIds }, status: 'ACTIVE', organization: { status: 'ACTIVE' } }, select: { id: true, userId: true, organizationId: true } }),
    ]);
    const live = new Set(sessions.filter((s) => !s.revokedAt && s.user.status === 'ACTIVE').map((s) => s.id));
    for (const socket of sockets) {
      const data = socket.data as SocketData;
      if (!live.has(data.sessionId)) {
        socket.disconnect(true);
        continue;
      }
      const wanted = new Set(memberships.filter((m) => m.userId === data.userId).map((m) => memberRoom(m.organizationId, m.id)));
      for (const room of socket.rooms) if (MEMBER_ROOM.test(room) && !wanted.has(room)) socket.leave(room);
      for (const room of wanted) if (!socket.rooms.has(room)) socket.join(room);
    }
  }
}
