import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { ApiError } from './error.js';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const session = (token: string) => ({
  data: { tokenType: 'Bearer', accessToken: token, expiresIn: 900, sessionId: 's1', user: { id: 'u1' } },
});
const expired = { error: { code: 'TOKEN_EXPIRED', message: 'x', requestId: 'r1' } };

describe('api client', () => {
  it('sends the client header and credentials for web, and unwraps data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { data: { id: 'u1' } }));
    const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'web', fetch: fetchMock });
    await expect(api.me.get()).resolves.toEqual({ id: 'u1' });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers['x-client-type']).toBe('web');
    expect(init.credentials).toBe('include');
  });

  it('turns error bodies into ApiError with code and request id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'x', requestId: 'req-1' } }),
    );
    const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'web', fetch: fetchMock });
    const err = await api.auth.login('a@b.co', 'pw').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('INVALID_CREDENTIALS');
    expect((err as ApiError).requestId).toBe('req-1');
  });

  it('maps a failed fetch to NETWORK_ERROR', async () => {
    const api = createApiClient({
      baseUrl: 'http://api/v1',
      clientType: 'web',
      fetch: vi.fn().mockRejectedValue(new TypeError('down')),
    });
    await expect(api.me.get()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('refreshes once on an expired token and retries the request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, session('t1'))) // login
      .mockResolvedValueOnce(json(401, expired)) // /me expired
      .mockResolvedValueOnce(json(200, session('t2'))) // refresh
      .mockResolvedValueOnce(json(200, { data: { id: 'u1' } })); // /me retry
    const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'web', fetch: fetchMock });
    await api.auth.login('a@b.co', 'pw');
    await expect(api.me.get()).resolves.toEqual({ id: 'u1' });
    const retry = fetchMock.mock.calls[3]![1];
    expect(retry.headers.authorization).toBe('Bearer t2');
  });

  it('shares one refresh between concurrent expired requests', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      if (url.endsWith('/auth/login')) return json(200, session('t1'));
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return json(200, session('t2'));
      }
      return init.headers.authorization === 'Bearer t2' ? json(200, { data: [] }) : json(401, expired);
    });
    const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'web', fetch: fetchMock as never });
    await api.auth.login('a@b.co', 'pw');
    await Promise.all([api.me.sessions(), api.me.sessions(), api.me.sessions()]);
    expect(refreshCalls).toBe(1);
  });

  it('calls onAuthLost when the refresh fails', async () => {
    const onAuthLost = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, session('t1')))
      .mockResolvedValueOnce(json(401, expired))
      .mockResolvedValueOnce(json(401, { error: { code: 'REFRESH_TOKEN_INVALID', message: 'x', requestId: 'r' } }));
    const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'web', fetch: fetchMock, onAuthLost });
    await api.auth.login('a@b.co', 'pw');
    await expect(api.me.get()).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(onAuthLost).toHaveBeenCalledOnce();
  });

  it('native clients send the stored refresh token in the body and persist the new one', async () => {
    let stored: string | null = 'old-rt';
    const fetchMock = vi.fn().mockResolvedValue(json(200, { data: { ...session('t1').data, refreshToken: 'new-rt' } }));
    const api = createApiClient({
      baseUrl: 'http://api/v1',
      clientType: 'ios',
      fetch: fetchMock,
      refreshTokenStore: { get: async () => stored, set: async (t) => void (stored = t) },
    });
    await api.restoreSession();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ refreshToken: 'old-rt' });
    expect(stored).toBe('new-rt');
    expect(fetchMock.mock.calls[0]![1].credentials).toBe('omit');
  });
});

describe('organization and admin endpoints', () => {
  const make = (fetchMock: ReturnType<typeof vi.fn>) => createApiClient({ baseUrl: 'http://api/v1', clientType: 'web', fetch: fetchMock });
  // A fresh Response per call: a Response body can only be read once.
  const ok = (data: unknown) => vi.fn().mockImplementation(() => Promise.resolve(json(200, { data })));

  it('login returns an MFA challenge without storing a session, then loginMfa completes it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { data: { mfaRequired: true, mfaToken: 'pending-token' } }))
      .mockResolvedValueOnce(json(200, session('access-1')));
    const api = make(fetchMock);
    const challenge = await api.auth.login('a@b.co', 'pw');
    expect(challenge).toEqual({ mfaRequired: true, mfaToken: 'pending-token' });
    expect(api.hasAccessToken()).toBe(false);

    await api.auth.loginMfa('pending-token', '123456');
    expect(api.hasAccessToken()).toBe(true);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('http://api/v1/auth/mfa/login');
    expect(JSON.parse(init.body)).toEqual({ mfaToken: 'pending-token', code: '123456' });
  });

  it('builds organization-scoped URLs and drops empty query values', async () => {
    const fetchMock = ok({ data: [], meta: { nextCursor: null } });
    const api = make(fetchMock);
    await api.org('org 1').members.list({ q: 'sara', roleId: '', status: undefined, limit: 25 });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://api/v1/orgs/org%201/members?q=sara&limit=25');
  });

  it('paginated calls return the whole envelope, plain calls only data', async () => {
    const page = { data: [{ id: 'm1' }], meta: { nextCursor: 'c1' } };
    const list = await make(vi.fn().mockResolvedValue(json(200, page))).org('o').members.list();
    expect(list).toEqual(page);
    const ctx = await make(vi.fn().mockResolvedValue(json(200, { data: { navigation: [] } }))).org('o').context();
    expect(ctx).toEqual({ navigation: [] });
  });

  it('sends mutations with JSON bodies to the right verbs', async () => {
    const fetchMock = ok({});
    const api = make(fetchMock);
    await api.org('o').members.changeRole('m1', 'r1');
    await api.org('o').members.remove('m1');
    await api.admin.platformRoles.revoke('u1');
    const calls = fetchMock.mock.calls.map(([url, init]) => [init.method, url, init.body]);
    expect(calls).toEqual([
      ['POST', 'http://api/v1/orgs/o/members/m1/role', JSON.stringify({ roleId: 'r1' })],
      ['DELETE', 'http://api/v1/orgs/o/members/m1', undefined],
      ['DELETE', 'http://api/v1/admin/platform-roles', JSON.stringify({ userId: 'u1', roleKey: 'super_admin' })],
    ]);
  });

  it('invitation preview is public (no bearer token)', async () => {
    const fetchMock = ok({ email: 'a@b.co' });
    const api = make(fetchMock);
    await api.invitations.preview('tok');
    expect(fetchMock.mock.calls[0]![1].headers.authorization).toBeUndefined();
  });

  it('surfaces MFA_REQUIRED from admin routes as a typed error without trying to refresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(403, { error: { code: 'MFA_REQUIRED', message: 'x', requestId: 'r' } }));
    const err = await make(fetchMock).admin.stats().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('MFA_REQUIRED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  describe('shared capabilities', () => {
    const file = { id: 'f1', name: 'a.png', mimeType: 'image/png', sizeBytes: 4, status: 'PENDING_UPLOAD' };

    it('uploads in three steps: request, PUT to the signed URL without credentials, complete', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(json(200, session('t1')))
        .mockResolvedValueOnce(json(201, { data: { file, upload: { method: 'PUT', url: 'https://storage/x?sig=1', headers: { 'Content-Type': 'image/png' }, expiresInSeconds: 900 } } }))
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(json(200, { data: { ...file, status: 'READY' } }));
      const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'web', fetch: fetchMock });
      await api.auth.login('a@b.co', 'pw');
      const done = await api.org('o1').files.upload({ fileName: 'a.png', mimeType: 'image/png', body: new Blob([new Uint8Array(4)]) });
      expect(done.status).toBe('READY');

      const [, requestInit] = fetchMock.mock.calls[1]!;
      expect(JSON.parse(requestInit.body)).toMatchObject({ fileName: 'a.png', mimeType: 'image/png', sizeBytes: 4 });
      const [putUrl, putInit] = fetchMock.mock.calls[2]!;
      expect(putUrl).toBe('https://storage/x?sig=1');
      expect(putInit.method).toBe('PUT');
      expect(putInit.credentials).toBe('omit'); // storage is authorized by the signature only
      expect(putInit.headers).toEqual({ 'Content-Type': 'image/png' });
      expect(fetchMock.mock.calls[3]![0]).toBe('http://api/v1/orgs/o1/files/f1/complete');
    });

    it('surfaces a storage rejection as an ApiError and never calls complete', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(json(201, { data: { file, upload: { method: 'PUT', url: 'https://storage/x', headers: {}, expiresInSeconds: 900 } } }))
        .mockResolvedValueOnce(json(413, { error: { code: 'FILE_TOO_LARGE', message: 'x', requestId: 'r' } }));
      const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'ios', fetch: fetchMock });
      await expect(api.org('o1').files.upload({ fileName: 'a.png', mimeType: 'image/png', body: new Blob(['abcd']) })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', status: 413 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('builds task, progress and notification URLs with only the defined query values', async () => {
      const fetchMock = vi.fn().mockImplementation(async () => json(200, { data: [], meta: { nextCursor: null } }));
      const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'ios', fetch: fetchMock });
      await api.org('o 1').tasks.list({ status: 'OPEN', assignee: 'me', q: '', overdue: true });
      await api.org('o1').progress.records.list({ subjectMembershipId: 'm1', metricId: 'x' });
      await api.org('o1').progress.groupSummary('g1', 'mt1');
      await api.me.notifications.list({ unread: true });
      await api.me.notifications.preferences();
      const urls = fetchMock.mock.calls.map((c) => c[0]);
      expect(urls).toEqual([
        'http://api/v1/orgs/o%201/tasks?status=OPEN&assignee=me&overdue=true',
        'http://api/v1/orgs/o1/progress/records?subjectMembershipId=m1&metricId=x',
        'http://api/v1/orgs/o1/progress/groups/g1/summary?metricId=mt1',
        'http://api/v1/me/notifications?unread=true',
        'http://api/v1/me/notification-preferences',
      ]);
    });

    it('returns the unread count as a number', async () => {
      const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'ios', fetch: vi.fn().mockResolvedValue(json(200, { data: { count: 3 } })) });
      await expect(api.me.notifications.unreadCount()).resolves.toBe(3);
    });
  });
  describe('fitness', () => {
    it('builds Fitness URLs: nested plan versions, set removal by exercise and number, query strings without empty values', async () => {
      const fetchMock = vi.fn().mockImplementation(async () => json(200, { data: [], meta: { nextCursor: null } }));
      const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'ios', fetch: fetchMock });
      const org = api.org('o1').fitness;
      await org.exercises.list({ q: 'squat', muscleGroup: 'QUADS', equipment: undefined });
      await org.plans.saveContent('p1', 'v1', { days: [] });
      await org.plans.publish('p1', 'v1');
      await org.plans.assign('p1', { clientMembershipIds: ['c1'], startDate: '2026-11-09', weeklySchedule: { '1': 1 } });
      await org.sessions.removeSet('s1', 'd1', 2);
      await org.sessions.list({ clientMembershipId: 'c1', limit: 10 });
      await org.workouts.today();
      const calls = fetchMock.mock.calls.map((c) => `${c[1].method} ${c[0]}`);
      expect(calls).toEqual([
        'GET http://api/v1/orgs/o1/fitness/exercises?q=squat&muscleGroup=QUADS',
        'PUT http://api/v1/orgs/o1/fitness/plans/p1/versions/v1/content',
        'POST http://api/v1/orgs/o1/fitness/plans/p1/versions/v1/publish',
        'POST http://api/v1/orgs/o1/fitness/plans/p1/assignments',
        'DELETE http://api/v1/orgs/o1/fitness/sessions/s1/sets/d1/2',
        'GET http://api/v1/orgs/o1/fitness/sessions?clientMembershipId=c1&limit=10',
        'GET http://api/v1/orgs/o1/fitness/workouts/today',
      ]);
    });
  });
  describe('messaging', () => {
    it('builds URLs for contacts, conversations, paging, read markers, mute and deletion', async () => {
      const fetchMock = vi.fn().mockImplementation(async () => json(200, { data: [], meta: { nextCursor: null } }));
      const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'ios', fetch: fetchMock });
      const m = api.org('o1').messaging;
      await m.contacts({ q: 'sa ra' });
      await m.unreadCount();
      await m.conversations.list();
      await m.conversations.start('m2');
      await m.conversations.messages('c1', { cursor: 'x', limit: 20 });
      await m.conversations.send('c1', { body: 'hi', fileIds: ['f1'] });
      await m.conversations.read('c1');
      await m.conversations.read('c1', 'msg1');
      await m.conversations.mute('c1', true);
      await m.conversations.deleteMessage('c1', 'msg1');
      await m.conversations.block('c1', true);
      await m.conversations.report('c1', 'msg1', { reason: 'SPAM' });
      await m.reports.list({ status: 'OPEN' });
      await m.reports.resolve('r1', { outcome: 'DISMISSED' });
      expect(fetchMock.mock.calls.map((c) => `${c[1].method} ${c[0]}`)).toEqual([
        'GET http://api/v1/orgs/o1/messaging/contacts?q=sa+ra',
        'GET http://api/v1/orgs/o1/messaging/unread-count',
        'GET http://api/v1/orgs/o1/messaging/conversations',
        'POST http://api/v1/orgs/o1/messaging/conversations',
        'GET http://api/v1/orgs/o1/messaging/conversations/c1/messages?cursor=x&limit=20',
        'POST http://api/v1/orgs/o1/messaging/conversations/c1/messages',
        'POST http://api/v1/orgs/o1/messaging/conversations/c1/read',
        'POST http://api/v1/orgs/o1/messaging/conversations/c1/read',
        'PUT http://api/v1/orgs/o1/messaging/conversations/c1/mute',
        'DELETE http://api/v1/orgs/o1/messaging/conversations/c1/messages/msg1',
        'PUT http://api/v1/orgs/o1/messaging/conversations/c1/block',
        'POST http://api/v1/orgs/o1/messaging/conversations/c1/messages/msg1/report',
        'GET http://api/v1/orgs/o1/messaging/reports?status=OPEN',
        'POST http://api/v1/orgs/o1/messaging/reports/r1/resolve',
      ]);
      expect(JSON.parse(fetchMock.mock.calls[3]![1].body)).toEqual({ membershipId: 'm2' });
      expect(JSON.parse(fetchMock.mock.calls[5]![1].body)).toEqual({ body: 'hi', fileIds: ['f1'] });
      expect(JSON.parse(fetchMock.mock.calls[6]![1].body)).toEqual({});
      expect(JSON.parse(fetchMock.mock.calls[7]![1].body)).toEqual({ messageId: 'msg1' });
    });

    it('hands the realtime connection a fresh token only when asked to renew', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(json(200, session('first')))
        .mockResolvedValueOnce(json(200, session('second')));
      const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'web', fetch: fetchMock });
      expect(await api.accessTokenForRealtime()).toBe('first'); // none yet: refreshes once
      expect(await api.accessTokenForRealtime()).toBe('first'); // has one: no request
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await api.accessTokenForRealtime(true)).toBe('second');
    });
  });

  describe('fitness nutrition and check-ins', () => {
    it('builds URLs for nutrition plans, meal logs, the weekly form, photos and comparison', async () => {
      const fetchMock = vi.fn().mockImplementation(async () => json(200, { data: [], meta: { nextCursor: null } }));
      const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'ios', fetch: fetchMock });
      const f = api.org('o1').fitness;
      await f.nutrition.plans.publish('p1', 'v1');
      await f.nutrition.today();
      await f.nutrition.today('2026-11-09');
      await f.nutrition.logMeal({ assignmentId: 'a', mealId: 'm', status: 'COMPLETED' });
      await f.nutrition.detachMealPhoto('l1', 'f1');
      await f.nutrition.logs({ clientMembershipId: 'c1', from: '2026-11-03', to: '2026-11-09' });
      await f.checkins.week('current');
      await f.checkins.saveWeek('previous', { measurements: { weight_kg: 80 } });
      await f.checkins.compare('x', 'y');
      await f.photos.forClient('c1');
      expect(fetchMock.mock.calls.map((c) => `${c[1].method} ${c[0]}`)).toEqual([
        'POST http://api/v1/orgs/o1/fitness/nutrition-plans/p1/versions/v1/publish',
        'GET http://api/v1/orgs/o1/fitness/nutrition/today',
        'GET http://api/v1/orgs/o1/fitness/nutrition/today?date=2026-11-09',
        'PUT http://api/v1/orgs/o1/fitness/nutrition/logs',
        'DELETE http://api/v1/orgs/o1/fitness/nutrition/logs/l1/photos/f1',
        'GET http://api/v1/orgs/o1/fitness/nutrition/logs?clientMembershipId=c1&from=2026-11-03&to=2026-11-09',
        'GET http://api/v1/orgs/o1/fitness/checkins/week/current',
        'PUT http://api/v1/orgs/o1/fitness/checkins/week/previous',
        'GET http://api/v1/orgs/o1/fitness/checkins/compare?from=x&to=y',
        'GET http://api/v1/orgs/o1/fitness/clients/c1/photos',
      ]);
    });

    it('uploads a sensitive photo with the sensitivity flag in the first step', async () => {
      const file = { id: 'f1', name: 'p.jpg', mimeType: 'image/jpeg', sizeBytes: 4, status: 'PENDING_UPLOAD' };
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(json(201, { data: { file, upload: { method: 'PUT', url: 'https://storage/x', headers: { 'Content-Type': 'image/jpeg' }, expiresInSeconds: 900 } } }))
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(json(200, { data: { ...file, status: 'READY' } }));
      const api = createApiClient({ baseUrl: 'http://api/v1', clientType: 'ios', fetch: fetchMock });
      await api.org('o1').files.upload({ fileName: 'p.jpg', mimeType: 'image/jpeg', body: new Blob(['abcd']), sensitivity: 'SENSITIVE' });
      expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ sensitivity: 'SENSITIVE', sizeBytes: 4 });
    });
  });
});
