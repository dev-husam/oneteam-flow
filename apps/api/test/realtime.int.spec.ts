import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { RealtimeGateway } from '../src/capabilities/messaging/realtime/realtime.gateway.js';
import { TokenService } from '../src/core/auth/token.service.js';
import { as, buildOrg, createTestApp, type OrgFixture, type TestApp } from './helpers/app.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What a socket heard, by event name. Payloads are untyped on purpose: the tests assert their shape. */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface Listener {
  socket: Socket;
  heard: { event: string; payload: any }[];
  next<T = any>(event: string, timeoutMs?: number): Promise<T>;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

describe('realtime: authenticated, tenant-bound server push', () => {
  let t: TestApp;
  let F: OrgFixture;
  let other: OrgFixture;
  let url: string;
  const open: Socket[] = [];
  const api = (who: keyof OrgFixture) => as(t, F[who] as OrgFixture['owner']);
  const msgBase = () => `/api/v1/orgs/${F.orgId}/messaging`;

  const target = (u: string = url) => u;
  /** Connects with a token and resolves once the server says it is ready, or rejects with the handshake error. */
  function connect(token: string | undefined, opts: { query?: Record<string, string>; target?: string } = {}): Promise<Listener> {
    const socket = io(target(opts.target), { auth: token === undefined ? {} : { token }, query: opts.query, transports: ['websocket'], reconnection: false, forceNew: true });
    open.push(socket);
    const heard: Listener['heard'] = [];
    socket.onAny((event, payload) => heard.push({ event, payload }));
    const listener: Listener = {
      socket,
      heard,
      next: (event, timeoutMs = 3_000) =>
        new Promise((resolve, reject) => {
          const existing = heard.find((h) => h.event === event);
          if (existing) return resolve(existing.payload);
          const timer = setTimeout(() => reject(new Error(`no "${event}" within ${timeoutMs}ms`)), timeoutMs);
          socket.once(event, (p) => { clearTimeout(timer); resolve(p); });
        }),
    };
    return new Promise((resolve, reject) => {
      socket.once('ready', () => resolve(listener));
      socket.once('connect_error', (err: Error & { data?: { code?: string } }) => reject(Object.assign(err, { code: err.data?.code })));
    });
  }
  const as_ = (who: keyof OrgFixture) => connect((F[who] as OrgFixture['owner']).accessToken);
  const startConv = async (who: keyof OrgFixture, target: keyof OrgFixture) =>
    (await api(who).post(`${msgBase()}/conversations`, { membershipId: (F[target] as OrgFixture['owner']).membershipId }).expect(201)).body.data.id as string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.app.listen(0);
    url = `http://127.0.0.1:${(t.app.getHttpServer().address() as AddressInfo).port}`;
    F = await buildOrg(t, 'Realtime Gym');
    other = await buildOrg(t, 'Other Realtime Gym');
  });
  afterEach(() => {
    for (const s of open.splice(0)) s.close();
  });
  afterAll(async () => t.app.close());

  describe('connecting', () => {
    it('refuses anyone without a valid access token, and never reads the token from the URL', async () => {
      await expect(connect(undefined)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(connect('')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(connect('not.a.jwt')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(connect(F.participant.refreshToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' }); // a refresh token is not an access token
      await expect(connect(undefined, { query: { token: F.participant.accessToken } })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      const ok = await as_('participant');
      expect(await ok.next('ready')).toMatchObject({ memberships: 1 });
    });

    it('refuses a token whose session was revoked or whose user is suspended', async () => {
      const victim = other.participant2;
      const live = await connect(victim.accessToken);
      expect(live.socket.connected).toBe(true);
      live.socket.close();
      await t.prisma.userSession.update({ where: { id: victim.sessionId }, data: { revokedAt: new Date() } });
      await expect(connect(victim.accessToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await t.prisma.userSession.update({ where: { id: victim.sessionId }, data: { revokedAt: null } });
      await t.prisma.user.update({ where: { id: victim.userId }, data: { status: 'SUSPENDED' } });
      await expect(connect(victim.accessToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await t.prisma.user.update({ where: { id: victim.userId }, data: { status: 'ACTIVE' } });
    });

    it('limits how many sockets one user can hold', async () => {
      const sockets: Listener[] = [];
      for (let i = 0; i < 10; i += 1) sockets.push(await connect(other.guardian.accessToken));
      await expect(connect(other.guardian.accessToken)).rejects.toMatchObject({ code: 'TOO_MANY_CONNECTIONS' });
      for (const s of sockets) s.socket.close();
    });

    it('closes the socket when the access token expires, telling the client why', async () => {
      const tokens = t.app.get(TokenService);
      const real = (tokens as unknown as { config: { ACCESS_TOKEN_TTL_SECONDS: number } }).config;
      (tokens as unknown as { config: unknown }).config = { ...real, ACCESS_TOKEN_TTL_SECONDS: 2 };
      const short = (await tokens.signAccessToken({ sub: other.participant.userId, sid: other.participant.sessionId })).token;
      (tokens as unknown as { config: unknown }).config = real;
      const l = await connect(short);
      const expired = l.next('auth:expired', 4_500);
      await expect(expired).resolves.toBeUndefined();
      await wait(200);
      expect(l.socket.connected).toBe(false);
    });
  });

  describe('delivery', () => {
    it('pushes new messages, deletions and read receipts to the two people only, in every device of theirs', async () => {
      const conv = await startConv('practitioner', 'participant');
      const pract = await as_('practitioner');
      const practPhone = await as_('practitioner'); // a second device of the same person
      const client = await as_('participant');
      // bystanders: same organization, and a stranger in another organization
      const bystanders = await Promise.all([as_('participant2'), as_('manager'), as_('owner'), connect(other.practitioner.accessToken)]);

      const sent = (await api('practitioner').post(`${msgBase()}/conversations/${conv}/messages`, { body: 'hello' }).expect(201)).body.data;
      for (const l of [pract, practPhone, client]) {
        expect(await l.next('message:new')).toMatchObject({ organizationId: F.orgId, conversationId: conv, message: { id: sent.id, body: 'hello', senderMembershipId: F.practitioner.membershipId } });
      }

      await api('participant').post(`${msgBase()}/conversations/${conv}/read`, { messageId: sent.id }).expect(200);
      for (const l of [pract, practPhone, client]) {
        expect(await l.next('conversation:read')).toMatchObject({ organizationId: F.orgId, conversationId: conv, membershipId: F.participant.membershipId, messageId: sent.id });
      }

      await api('practitioner').del(`${msgBase()}/conversations/${conv}/messages/${sent.id}`).expect(204);
      for (const l of [pract, practPhone, client]) expect(await l.next('message:deleted')).toMatchObject({ conversationId: conv, messageId: sent.id });

      await wait(400);
      for (const b of bystanders) expect(b.heard.filter((h) => h.event !== 'ready'), 'a bystander heard something').toEqual([]);
    });

    it('cannot be steered by the client: no joining rooms, no sending events, repeat offenders are dropped', async () => {
      const conv = await startConv('practitioner', 'participant');
      const snoop = await as_('participant2');
      const room = `org:${F.orgId}:member:${F.participant.membershipId}`;
      for (const [event, arg] of [['join', room], ['subscribe', { room }], ['join-room', room], ['message:new', { organizationId: F.orgId }]] as const) snoop.socket.emit(event, arg);
      await wait(200);
      await api('practitioner').post(`${msgBase()}/conversations/${conv}/messages`, { body: 'not for snoopers' }).expect(201);
      await wait(400);
      expect(snoop.heard.filter((h) => h.event === 'message:new')).toEqual([]);

      for (let i = 0; i < 8; i += 1) snoop.socket.emit('anything', i);
      await wait(400);
      expect(snoop.socket.connected).toBe(false);
    });

    it('does not deliver to members who are no longer active, even before the periodic check runs', async () => {
      const conv = await startConv('manager', 'participant2');
      const ex = await as_('participant2');
      await t.prisma.membership.update({ where: { id: F.participant2.membershipId }, data: { status: 'SUSPENDED' } });
      await api('manager').post(`${msgBase()}/conversations/${conv}/messages`, { body: 'are you there' }).expect(201);
      await wait(400);
      expect(ex.heard.filter((h) => h.event === 'message:new')).toEqual([]);
      await t.prisma.membership.update({ where: { id: F.participant2.membershipId }, data: { status: 'ACTIVE' } });
    });
  });

  describe('after access is revoked', () => {
    const gateway = () => t.app.get(RealtimeGateway);

    it('drops the sockets of a revoked session and of a suspended user on the next check', async () => {
      const a = await connect(other.admin.accessToken);
      const b = await connect(other.manager.accessToken);
      await t.prisma.userSession.update({ where: { id: other.admin.sessionId }, data: { revokedAt: new Date() } });
      await t.prisma.user.update({ where: { id: other.manager.userId }, data: { status: 'SUSPENDED' } });
      await gateway().revalidate();
      await wait(300);
      expect(a.socket.connected).toBe(false);
      expect(b.socket.connected).toBe(false);
      await t.prisma.userSession.update({ where: { id: other.admin.sessionId }, data: { revokedAt: null } });
      await t.prisma.user.update({ where: { id: other.manager.userId }, data: { status: 'ACTIVE' } });
    });

    it('takes a removed member out of their organization rooms while their session stays valid', async () => {
      const conv = (await as(t, other.practitioner).post(`/api/v1/orgs/${other.orgId}/messaging/conversations`, { membershipId: other.participant.membershipId }).expect(201)).body.data.id as string;
      const client = await connect(other.participant.accessToken);
      await as(t, other.practitioner).post(`/api/v1/orgs/${other.orgId}/messaging/conversations/${conv}/messages`, { body: 'one' }).expect(201);
      expect((await client.next('message:new')).message.body).toBe('one');

      await t.prisma.membership.update({ where: { id: other.participant.membershipId }, data: { status: 'REMOVED' } });
      await gateway().revalidate();
      const before = client.heard.length;
      // addressed straight to the old room: nobody is in it any more
      t.app.get(RealtimeGateway)['realtime'].emitToMembers(other.orgId, [other.participant.membershipId], 'message:new', { probe: true });
      await wait(300);
      expect(client.heard.length).toBe(before);

      // and a member who joins later is put in their room without reconnecting
      await t.prisma.membership.update({ where: { id: other.participant.membershipId }, data: { status: 'ACTIVE' } });
      await gateway().revalidate();
      t.app.get(RealtimeGateway)['realtime'].emitToMembers(other.orgId, [other.participant.membershipId], 'message:new', { probe: 'back' });
      await wait(300);
      expect(client.heard.slice(before).some((h) => h.payload?.probe === 'back')).toBe(true);
    });
  });

  describe('several API instances', () => {
    it('delivers through Redis to a socket connected to another instance', async () => {
      const second = await createTestApp();
      await second.app.listen(0);
      try {
        // same signing keys, so a token from the first instance is valid on the second
        (second.app.get(TokenService) as unknown as { keys: unknown }).keys = (t.app.get(TokenService) as unknown as { keys: unknown }).keys;
        const secondUrl = `http://127.0.0.1:${(second.app.getHttpServer().address() as AddressInfo).port}`;
        const conv = await startConv('practitioner', 'participant');
        const onOther = await connect(F.participant.accessToken, { target: secondUrl });
        await api('practitioner').post(`${msgBase()}/conversations/${conv}/messages`, { body: 'across instances' }).expect(201);
        expect((await onOther.next('message:new')).message.body).toBe('across instances');
      } finally {
        await second.app.close();
      }
    });
  });
});
