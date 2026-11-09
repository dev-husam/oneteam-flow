import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MESSAGE_MAX_LENGTH } from '@pt/domain';
import { TokenService } from '../src/core/auth/token.service.js';
import { REDIS } from '../src/infra/redis/redis.module.js';
import { PDF, PNG, as, buildOrg, createTestApp, uploadFile, type OrgFixture, type TestApp } from './helpers/app.js';

const code = (r: { body: { error?: { code?: string } } }) => r.body.error?.code;

describe('messaging: private one-to-one conversations', () => {
  let t: TestApp;
  let F: OrgFixture;
  let other: OrgFixture;
  const api = (who: keyof OrgFixture) => as(t, F[who] as OrgFixture['owner']);
  const base = () => `/api/v1/orgs/${F.orgId}/messaging`;
  const start = (who: keyof OrgFixture, target: keyof OrgFixture) => api(who).post(`${base()}/conversations`, { membershipId: (F[target] as OrgFixture['owner']).membershipId });
  const convWith = async (who: keyof OrgFixture, target: keyof OrgFixture): Promise<string> => (await start(who, target).expect(201)).body.data.id;
  const send = (who: keyof OrgFixture, conv: string, body: object) => api(who).post(`${base()}/conversations/${conv}/messages`, body);
  const notificationsFor = (who: keyof OrgFixture) => t.prisma.notification.count({ where: { userId: (F[who] as OrgFixture['owner']).userId, typeKey: 'message.new' } });

  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Chat Gym');
    other = await buildOrg(t, 'Other Chat Gym');
  });
  afterAll(async () => t.app.close());

  describe('who can talk to whom', () => {
    it('lists only people the caller may start a conversation with, by the reach of their grant', async () => {
      const names = async (who: keyof OrgFixture) => (await api(who).get(`${base()}/contacts`).expect(200)).body.data.map((c: { membershipId: string }) => c.membershipId).sort();
      const ids = (...who: (keyof OrgFixture)[]) => who.map((w) => (F[w] as OrgFixture['owner']).membershipId).sort();
      expect(await names('participant')).toEqual(ids('practitioner')); // assigned people only
      expect(await names('practitioner')).toEqual(ids('participant')); // the clients assigned to them
      expect(await names('participant2')).toEqual([]); // not assigned to anyone
      // organization-wide grant: everybody who can use messaging (a guardian role has no message.send)
      expect(await names('manager')).toEqual(ids('owner', 'admin', 'practitioner', 'practitioner2', 'participant', 'participant2'));
      expect((await api('guardian').get(`${base()}/contacts`)).status).toBe(403);
      const filtered = (await api('manager').get(`${base()}/contacts?q=${encodeURIComponent('zzzz-nobody')}`).expect(200)).body.data;
      expect(filtered).toEqual([]);
    });

    it('starts a conversation once per pair, in either direction, and refuses unreachable people', async () => {
      const a = await convWith('participant', 'practitioner');
      expect(await convWith('practitioner', 'participant')).toBe(a); // same pair, same conversation
      expect(await convWith('participant', 'practitioner')).toBe(a);
      expect(await t.prisma.conversation.count({ where: { organizationId: F.orgId, createdByMembershipId: F.participant.membershipId, directKey: { not: null } } })).toBe(1);

      expect(code(await start('participant', 'participant2'))).toBe('CONTACT_NOT_ALLOWED'); // not assigned to each other
      expect(code(await start('participant', 'manager'))).toBe('CONTACT_NOT_ALLOWED'); // assigned scope: a manager is not "theirs"
      expect(code(await start('practitioner2', 'participant'))).toBe('CONTACT_NOT_ALLOWED'); // someone else's client
      expect(code(await start('manager', 'guardian'))).toBe('CONTACT_NOT_ALLOWED'); // they could not read or answer it
      expect((await start('manager', 'participant2')).status).toBe(201); // org-wide grant may start with anyone

      expect((await start('participant', 'participant')).status).toBe(400); // yourself
      expect((await api('participant').post(`${base()}/conversations`, { membershipId: other.participant.membershipId })).status).toBe(404); // another organization
      expect((await api('participant').post(`${base()}/conversations`, { membershipId: 'not-a-uuid' })).status).toBe(400);
      expect((await api('guardian').post(`${base()}/conversations`, { membershipId: F.owner.membershipId })).status).toBe(403);
    });

    it('does not offer or open conversations with suspended members', async () => {
      await t.prisma.membership.update({ where: { id: F.practitioner2.membershipId }, data: { status: 'SUSPENDED' } });
      expect((await start('manager', 'practitioner2')).status).toBe(404);
      const list = (await api('manager').get(`${base()}/contacts`).expect(200)).body.data.map((c: { membershipId: string }) => c.membershipId);
      expect(list).not.toContain(F.practitioner2.membershipId);
      await t.prisma.membership.update({ where: { id: F.practitioner2.membershipId }, data: { status: 'ACTIVE' } });
    });

    it('lets a conversation continue after the assignment ends: replying needs membership of the conversation, not reach', async () => {
      const conv = await convWith('participant', 'practitioner');
      await t.prisma.memberAssignment.updateMany({ where: { organizationId: F.orgId, participantMembershipId: F.participant.membershipId }, data: { endedAt: new Date() } });
      expect((await send('participant', conv, { body: 'Still here?' })).status).toBe(201);
      expect(code(await start('practitioner', 'participant2'))).toBe('CONTACT_NOT_ALLOWED');
      await t.prisma.memberAssignment.updateMany({ where: { organizationId: F.orgId, participantMembershipId: F.participant.membershipId }, data: { endedAt: null } });
    });
  });

  describe('messages', () => {
    it('sends text, returns newest first with paging, trims, and refuses empty or oversized messages', async () => {
      const conv = await convWith('practitioner', 'participant');
      const sent: string[] = [];
      for (const body of ['one', 'two', '  three  \r\n']) sent.push((await send('practitioner', conv, { body }).expect(201)).body.data.id);
      const first = (await api('participant').get(`${base()}/conversations/${conv}/messages?limit=2`).expect(200)).body;
      expect(first.data.map((m: { body: string }) => m.body)).toEqual(['three', 'two']);
      expect(first.data[0]).toMatchObject({ senderMembershipId: F.practitioner.membershipId, kind: 'TEXT', deleted: false, attachments: [] });
      expect(first.meta.nextCursor).toBeTruthy();
      const second = (await api('participant').get(`${base()}/conversations/${conv}/messages?limit=2&cursor=${first.meta.nextCursor}`).expect(200)).body;
      expect(second.data.map((m: { body: string }) => m.body)).toContain('one');
      expect(second.meta.nextCursor).toBeNull();

      expect((await send('practitioner', conv, { body: '   ' })).status).toBe(400);
      expect((await send('practitioner', conv, {})).status).toBe(400);
      expect((await send('practitioner', conv, { body: 'x'.repeat(MESSAGE_MAX_LENGTH + 1) })).status).toBe(400);
      expect((await send('practitioner', conv, { body: 'x'.repeat(MESSAGE_MAX_LENGTH) })).status).toBe(201);
      expect(await t.prisma.message.count({ where: { id: { in: sent } } })).toBe(3);
    });

    it('is private to the two people: everybody else gets 404, including managers and owners', async () => {
      const conv = await convWith('practitioner', 'participant');
      const msg = (await send('practitioner', conv, { body: 'private' }).expect(201)).body.data;
      for (const who of ['practitioner2', 'participant2', 'manager', 'admin', 'owner'] as const) {
        expect((await api(who).get(`${base()}/conversations/${conv}`)).status, `get ${who}`).toBe(404);
        expect((await api(who).get(`${base()}/conversations/${conv}/messages`)).status, `list ${who}`).toBe(404);
        expect((await send(who, conv, { body: 'hi' })).status, `send ${who}`).toBe(404);
        expect((await api(who).post(`${base()}/conversations/${conv}/read`)).status, `read ${who}`).toBe(404);
        expect((await api(who).put(`${base()}/conversations/${conv}/mute`, { muted: true })).status, `mute ${who}`).toBe(404);
        expect((await api(who).del(`${base()}/conversations/${conv}/messages/${msg.id}`)).status, `delete ${who}`).toBe(404);
        const listed = (await api(who).get(`${base()}/conversations`).expect(200)).body.data.map((c: { id: string }) => c.id);
        expect(listed, `list of ${who}`).not.toContain(conv);
      }
      // someone from another organization cannot even address it
      expect((await as(t, other.owner).get(`/api/v1/orgs/${other.orgId}/messaging/conversations/${conv}`)).status).toBe(404);
      expect((await as(t, other.owner).get(`${base()}/conversations/${conv}`)).status).toBe(404);
    });

    it('counts unread messages from a marker, moves the marker only forward, and clears on read', async () => {
      const conv = await convWith('manager', 'participant2');
      const m1 = (await send('manager', conv, { body: 'a' }).expect(201)).body.data;
      const m2 = (await send('manager', conv, { body: 'b' }).expect(201)).body.data;
      const unread = async (who: keyof OrgFixture) => (await api(who).get(`${base()}/unread-count`).expect(200)).body.data.count;
      const summary = async (who: keyof OrgFixture) => (await api(who).get(`${base()}/conversations`).expect(200)).body.data.find((c: { id: string }) => c.id === conv);

      expect(await unread('participant2')).toBe(2);
      expect(await unread('manager')).toBe(0); // your own messages are never unread
      expect(await summary('participant2')).toMatchObject({ unreadCount: 2, lastMessage: { id: m2.id, preview: 'b' }, other: { membershipId: F.manager.membershipId } });

      await api('participant2').post(`${base()}/conversations/${conv}/read`, { messageId: m1.id }).expect(200);
      expect(await unread('participant2')).toBe(1);
      await api('participant2').post(`${base()}/conversations/${conv}/read`, { messageId: m2.id }).expect(200);
      await api('participant2').post(`${base()}/conversations/${conv}/read`, { messageId: m1.id }).expect(200); // an old message does not move it back
      expect(await unread('participant2')).toBe(0);
      expect((await api('participant2').post(`${base()}/conversations/${conv}/read`, { messageId: '01a1b176-c7f4-7320-ac2a-600a7862cf71' })).status).toBe(404);

      await send('participant2', conv, { body: 'thanks' }).expect(201);
      expect(await unread('manager')).toBe(1);
      await api('manager').post(`${base()}/conversations/${conv}/read`).expect(200); // no id = everything
      expect(await unread('manager')).toBe(0);
    });

    it('lets senders delete their own message: the text and attachments go, a tombstone stays', async () => {
      const conv = await convWith('practitioner', 'participant');
      const file = await uploadFile(t, F.practitioner, F.orgId, PDF, 'application/pdf', 'plan.pdf');
      const msg = (await send('practitioner', conv, { body: 'secret plan', fileIds: [file.id] }).expect(201)).body.data;
      expect(msg.attachments).toEqual([{ fileId: file.id, fileName: 'plan.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length }]);
      expect((await api('participant').get(`${base().replace('/messaging', '')}/files/${file.id}/download-url`)).status).toBe(200);

      expect((await api('participant').del(`${base()}/conversations/${conv}/messages/${msg.id}`)).status).toBe(403); // not the sender
      await api('practitioner').del(`${base()}/conversations/${conv}/messages/${msg.id}`).expect(204);
      expect((await api('practitioner').del(`${base()}/conversations/${conv}/messages/${msg.id}`)).status).toBe(404); // already gone

      const listed = (await api('participant').get(`${base()}/conversations/${conv}/messages`).expect(200)).body.data.find((m: { id: string }) => m.id === msg.id);
      expect(listed).toMatchObject({ deleted: true, body: '', attachments: [] });
      const row = await t.prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
      expect(row.body).toBe(''); // the text is gone from the database too
      expect(await t.prisma.messageAttachment.count({ where: { messageId: msg.id } })).toBe(0);
      expect((await api('participant').get(`${base().replace('/messaging', '')}/files/${file.id}/download-url`)).status).toBe(404);
    });
  });

  describe('attachments', () => {
    it('only your own finished, non-sensitive files, one message per file, readable by the two people only', async () => {
      const conv = await convWith('practitioner', 'participant');
      const files = `/api/v1/orgs/${F.orgId}/files`;
      const mine = await uploadFile(t, F.practitioner, F.orgId, PNG, 'image/png', 'a.png');
      const theirs = await uploadFile(t, F.participant, F.orgId, PNG, 'image/png', 'b.png');
      const sensitive = await uploadFile(t, F.practitioner, F.orgId, PNG, 'image/png', 'c.png', 'SENSITIVE');

      expect(code(await send('practitioner', conv, { fileIds: [theirs.id] }))).toBe('VALIDATION_FAILED'); // someone else's upload
      expect(code(await send('practitioner', conv, { fileIds: [sensitive.id] }))).toBe('VALIDATION_FAILED'); // private photos do not go through chat
      expect(code(await send('practitioner', conv, { fileIds: ['01a1b176-c7f4-7320-ac2a-600a7862cf71'] }))).toBe('VALIDATION_FAILED');
      expect((await send('practitioner', conv, { fileIds: Array(6).fill(mine.id) })).status).toBe(400);

      // the file is not readable by the other person before it is attached
      expect((await api('participant').get(`${files}/${mine.id}/download-url`)).status).toBe(404);
      const ok = await send('practitioner', conv, { fileIds: [mine.id] });
      expect(ok.status).toBe(201); // a file alone is a message
      expect(ok.body.data.body).toBe('');
      expect((await api('participant').get(`${files}/${mine.id}/download-url`)).status).toBe(200);
      for (const who of ['practitioner2', 'participant2', 'manager', 'owner'] as const) expect((await api(who).get(`${files}/${mine.id}/download-url`)).status, who).toBe(404);
      expect(code(await send('practitioner', conv, { fileIds: [mine.id] }))).toBe('CONFLICT'); // already used
    });
  });

  describe('notifications', () => {
    it('tells the other person once per burst, never with the text, and stays quiet when muted', async () => {
      const conv = await convWith('manager', 'admin');
      const before = await notificationsFor('admin');
      await send('manager', conv, { body: 'first private text' }).expect(201);
      await send('manager', conv, { body: 'second' }).expect(201);
      await send('manager', conv, { body: 'third' }).expect(201);
      expect(await notificationsFor('admin')).toBe(before + 1); // one notification for the burst
      const n = await t.prisma.notification.findFirstOrThrow({ where: { userId: F.admin.userId, typeKey: 'message.new' }, orderBy: { id: 'desc' } });
      expect(n.params).toEqual({ sender: expect.any(String) });
      expect(JSON.stringify(n)).not.toContain('private text');
      expect(n.data).toMatchObject({ conversationId: conv });

      await api('admin').post(`${base()}/conversations/${conv}/read`).expect(200);
      await send('manager', conv, { body: 'after reading' }).expect(201);
      expect(await notificationsFor('admin')).toBe(before + 2); // a new unread streak notifies again

      await api('admin').post(`${base()}/conversations/${conv}/read`).expect(200);
      await api('admin').put(`${base()}/conversations/${conv}/mute`, { muted: true }).expect(200);
      await send('manager', conv, { body: 'quiet please' }).expect(201);
      expect(await notificationsFor('admin')).toBe(before + 2); // muted: no notification, the message still arrives
      expect((await api('admin').get(`${base()}/conversations`).expect(200)).body.data.find((c: { id: string }) => c.id === conv)).toMatchObject({ muted: true, unreadCount: 1 });
      await api('admin').put(`${base()}/conversations/${conv}/mute`, { muted: false }).expect(200);
    });
  });
  describe('blocking', () => {
    it('stops the blocked person from sending (and the blocker too), hides both from each other, keeps history, and can be undone', async () => {
      const conv = await convWith('participant', 'practitioner');
      await send('practitioner', conv, { body: 'before the block' }).expect(201);
      const summaryOf = async (who: keyof OrgFixture) => (await api(who).get(`${base()}/conversations/${conv}`).expect(200)).body.data;
      expect(await summaryOf('participant')).toMatchObject({ blockedByMe: false, canSend: true });

      const blocked = (await api('participant').put(`${base()}/conversations/${conv}/block`, { blocked: true }).expect(200)).body.data;
      expect(blocked).toMatchObject({ blockedByMe: true, canSend: false });
      expect(await summaryOf('practitioner')).toMatchObject({ blockedByMe: false, canSend: false }); // they are told only that they cannot send
      await api('participant').put(`${base()}/conversations/${conv}/block`, { blocked: true }).expect(200); // again: no second row
      expect(await t.prisma.messageBlock.count({ where: { organizationId: F.orgId, blockerMembershipId: F.participant.membershipId } })).toBe(1);

      const before = await t.prisma.message.count({ where: { conversationId: conv } });
      const notified = await t.prisma.notification.count({ where: { userId: F.participant.userId, typeKey: 'message.new' } });
      expect(code(await send('practitioner', conv, { body: 'let me in' }))).toBe('CONTACT_NOT_ALLOWED');
      expect(code(await send('participant', conv, { body: 'hello?' }))).toBe('CONTACT_NOT_ALLOWED'); // unblock first
      expect(await t.prisma.message.count({ where: { conversationId: conv } })).toBe(before); // nothing stored
      expect(await t.prisma.notification.count({ where: { userId: F.participant.userId, typeKey: 'message.new' } })).toBe(notified); // nothing pushed

      const ids = async (who: keyof OrgFixture) => (await api(who).get(`${base()}/contacts`).expect(200)).body.data.map((c: { membershipId: string }) => c.membershipId);
      expect(await ids('participant')).not.toContain(F.practitioner.membershipId);
      expect(await ids('practitioner')).not.toContain(F.participant.membershipId);
      expect((await api('participant').get(`${base()}/conversations/${conv}/messages`).expect(200)).body.data.map((m: { body: string }) => m.body)).toContain('before the block'); // history stays

      expect((await api('practitioner2').put(`${base()}/conversations/${conv}/block`, { blocked: true })).status).toBe(404); // not yours
      expect((await api('participant').put(`${base()}/conversations/${conv}/block`, { blocked: 'yes' })).status).toBe(400);

      await api('participant').put(`${base()}/conversations/${conv}/block`, { blocked: false }).expect(200);
      expect(await summaryOf('practitioner')).toMatchObject({ canSend: true });
      expect((await send('practitioner', conv, { body: 'back again' })).status).toBe(201);
      expect(await ids('participant')).toContain(F.practitioner.membershipId);

      const audited = await t.prisma.auditLog.findMany({ where: { organizationId: F.orgId, action: { in: ['message.blocked', 'message.unblocked'] }, actorUserId: F.participant.userId }, orderBy: { id: 'asc' } });
      expect(audited.map((a) => a.action)).toEqual(['message.blocked', 'message.unblocked']);
      expect(audited[0]!.targetId).toBe(F.practitioner.membershipId);
    });
  });

  describe('reporting and moderation', () => {
    const reportsUrl = (query = '') => `${base()}/reports${query}`;
    const report = (who: keyof OrgFixture, conv: string, messageId: string, body: object = { reason: 'HARASSMENT', note: 'He keeps insulting me' }) => api(who).post(`${base()}/conversations/${conv}/messages/${messageId}/report`, body);

    it('lets the recipient report one message once; others, own, deleted or unknown messages cannot be reported', async () => {
      const conv = await convWith('practitioner', 'participant');
      const unrelated = (await send('practitioner', conv, { body: 'unrelated private text' }).expect(201)).body.data;
      const bad = (await send('practitioner', conv, { body: 'you are useless' }).expect(201)).body.data;
      const mine = (await send('participant', conv, { body: 'my own words' }).expect(201)).body.data;
      void unrelated;

      const ok = await report('participant', conv, bad.id);
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({ status: 'OPEN' });
      expect(code(await report('participant', conv, bad.id))).toBe('CONFLICT'); // once
      expect((await report('participant', conv, mine.id)).status).toBe(404); // your own message
      expect((await report('participant', conv, '01a1b176-c7f4-7320-ac2a-600a7862cf71')).status).toBe(404);
      expect((await report('practitioner2', conv, bad.id)).status).toBe(404); // not in the conversation
      expect((await report('manager', conv, bad.id)).status).toBe(404); // not even a moderator-level role
      expect((await report('participant', conv, bad.id, { reason: 'RUDE' })).status).toBe(400);
      expect((await report('participant', conv, bad.id, { reason: 'SPAM', note: 'x'.repeat(501) })).status).toBe(400);
      expect(await t.prisma.auditLog.count({ where: { organizationId: F.orgId, action: 'message.reported', actorUserId: F.participant.userId } })).toBeGreaterThanOrEqual(1);
    });

    it('shows moderators the reported message only (a snapshot that survives deletion), tells them, and keeps everyone else out', async () => {
      const conv = await convWith('practitioner', 'participant');
      await send('practitioner', conv, { body: 'a normal message nobody reported' }).expect(201);
      const file = await uploadFile(t, F.practitioner, F.orgId, PDF, 'application/pdf', 'threat.pdf');
      const bad = (await send('practitioner', conv, { body: 'snapshot me please', fileIds: [file.id] }).expect(201)).body.data;
      const ownerBefore = await t.prisma.notification.count({ where: { userId: F.owner.userId, typeKey: 'message.reported' } });
      const adminBefore = await t.prisma.notification.count({ where: { userId: F.admin.userId, typeKey: 'message.reported' } });
      await report('participant', conv, bad.id, { reason: 'INAPPROPRIATE' }).expect(201);
      await api('practitioner').del(`${base()}/conversations/${conv}/messages/${bad.id}`).expect(204); // the sender deletes it afterwards

      for (const who of ['owner', 'admin'] as const) {
        const body = (await api(who).get(reportsUrl('?status=OPEN')).expect(200)).body;
        const mine = body.data.find((r: { snapshot: { body: string } }) => r.snapshot.body === 'snapshot me please');
        expect(mine, who).toMatchObject({ status: 'OPEN', reason: 'INAPPROPRIATE', reporter: { membershipId: F.participant.membershipId }, reported: { membershipId: F.practitioner.membershipId }, snapshot: { attachments: [{ fileName: 'threat.pdf', mimeType: 'application/pdf' }] } });
        expect(JSON.stringify(body), who).not.toContain('a normal message nobody reported'); // nothing else of the conversation
      }
      expect(await t.prisma.notification.count({ where: { userId: F.owner.userId, typeKey: 'message.reported' } })).toBe(ownerBefore + 1);
      expect(await t.prisma.notification.count({ where: { userId: F.admin.userId, typeKey: 'message.reported' } })).toBe(adminBefore + 1);
      expect(await t.prisma.notification.count({ where: { userId: { in: [F.participant.userId, F.practitioner.userId] }, typeKey: 'message.reported' } })).toBe(0); // not the two involved

      for (const who of ['manager', 'practitioner', 'practitioner2', 'participant', 'participant2', 'guardian'] as const) expect((await api(who).get(reportsUrl())).status, who).toBe(403);
      expect((await as(t, other.owner).get(`/api/v1/orgs/${other.orgId}/messaging/reports`).expect(200)).body.data).toEqual([]); // another organization sees nothing
      expect((await as(t, other.owner).get(reportsUrl())).status).toBe(404);
    });

    it('never lets a moderator review a report they are part of; another moderator can', async () => {
      const conv = await convWith('manager', 'admin');
      const said = (await send('admin', conv, { body: 'admin says something' }).expect(201)).body.data;
      await report('manager', conv, said.id, { reason: 'OTHER' }).expect(201);
      const mineAsAdmin = (await api('admin').get(reportsUrl()).expect(200)).body.data.filter((r: { snapshot: { body: string } }) => r.snapshot.body === 'admin says something');
      expect(mineAsAdmin).toEqual([]); // the admin is the one reported
      const asOwner = (await api('owner').get(reportsUrl()).expect(200)).body.data.find((r: { snapshot: { body: string } }) => r.snapshot.body === 'admin says something');
      expect(asOwner).toBeDefined();
      expect((await api('admin').post(reportsUrl(`/${asOwner.id}/resolve`), { outcome: 'DISMISSED' })).status).toBe(404);
      await api('owner').post(reportsUrl(`/${asOwner.id}/resolve`), { outcome: 'DISMISSED' }).expect(200);
    });

    it('resolves a report once, with a note, tells the reporter, and audits it', async () => {
      const conv = await convWith('practitioner', 'participant');
      const bad = (await send('practitioner', conv, { body: 'resolve me' }).expect(201)).body.data;
      await report('participant', conv, bad.id, { reason: 'SPAM' }).expect(201);
      const item = (await api('owner').get(reportsUrl('?status=OPEN')).expect(200)).body.data.find((r: { snapshot: { body: string } }) => r.snapshot.body === 'resolve me');
      const reporterBefore = await t.prisma.notification.count({ where: { userId: F.participant.userId, typeKey: 'message.report_resolved' } });

      expect((await api('owner').post(reportsUrl(`/${item.id}/resolve`), { outcome: 'MAYBE' })).status).toBe(400);
      expect((await api('manager').post(reportsUrl(`/${item.id}/resolve`), { outcome: 'DISMISSED' })).status).toBe(403);
      const done = (await api('owner').post(reportsUrl(`/${item.id}/resolve`), { outcome: 'ACTIONED', note: 'Spoke to the trainer' }).expect(200)).body.data;
      expect(done).toMatchObject({ status: 'ACTIONED', resolutionNote: 'Spoke to the trainer', resolvedBy: expect.any(String) });
      expect(code(await api('admin').post(reportsUrl(`/${item.id}/resolve`), { outcome: 'DISMISSED' }))).toBe('CONFLICT');

      expect(await t.prisma.notification.count({ where: { userId: F.participant.userId, typeKey: 'message.report_resolved' } })).toBe(reporterBefore + 1);
      const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { organizationId: F.orgId, action: 'message.report_resolved', targetId: item.id } });
      expect(audit.metadata).toEqual({ outcome: 'ACTIONED' }); // no text in the audit trail
      const open = (await api('owner').get(reportsUrl('?status=OPEN')).expect(200)).body.data.map((r: { id: string }) => r.id);
      expect(open).not.toContain(item.id);
      expect((await api('owner').get(reportsUrl('?status=BOGUS'))).status).toBe(400);
    });
  });

  describe('rate limiting', () => {
    it('limits how fast one person can send, without blocking reading', async () => {
      const conv = await convWith('practitioner', 'participant');
      // a second instance with throttling on, sharing the first one's signing keys and database
      process.env.RATE_LIMIT_ENABLED = 'true';
      const limited = await createTestApp();
      process.env.RATE_LIMIT_ENABLED = 'false';
      (limited.app.get(TokenService) as unknown as { keys: unknown }).keys = (t.app.get(TokenService) as unknown as { keys: unknown }).keys;
      const redis = limited.app.get(REDIS);
      const clear = async () => { const keys = await redis.keys('rl:*'); if (keys.length) await redis.del(...keys); };
      await clear();
      try {
        const sendLimited = (i: number) => as(limited, F.practitioner).post(`${base()}/conversations/${conv}/messages`, { body: `m${i}` });
        const statuses: number[] = [];
        for (let i = 0; i < 64; i += 1) statuses.push((await sendLimited(i)).status);
        expect(statuses.slice(0, 60).every((s) => s === 201)).toBe(true);
        expect(statuses.slice(60)).toContain(429);
        const refused = await sendLimited(99);
        expect(refused.status).toBe(429);
        expect(refused.body.error.code).toBe('RATE_LIMITED');
        expect((await as(limited, F.practitioner).get(`${base()}/conversations/${conv}/messages`)).status).toBe(200); // reading has its own budget
      } finally {
        await clear();
        await limited.app.close();
      }
    });
  });
});
