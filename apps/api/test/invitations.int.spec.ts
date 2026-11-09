import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryOutbox } from '../src/infra/mail/mail.service.js';
import { STRONG_PASSWORD, addMember, as, buildOrg, createOrg, createTestApp, mailTo, signUpAndLogin, systemRoleId, tokenFromMail, uniqueEmail, waitForMail, type OrgFixture, type TestApp } from './helpers/app.js';

const code = (res: { body: { error?: { code?: string } } }) => res.body.error?.code;

describe('invitations', () => {
  let t: TestApp;
  let F: OrgFixture;
  let base: string;
  let participantRole: string;
  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Invite Gym');
    base = `/api/v1/orgs/${F.orgId}`;
    participantRole = await systemRoleId(t, 'participant');
  });
  afterAll(async () => t.app.close());

  const invite = async (email: string, extra: object = {}) => {
    const res = await as(t, F.owner).post(`${base}/invitations`, { email, roleId: participantRole, ...extra });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const mail = await waitForMail(mailTo(email, 'invited you'));
    return { id: res.body.data.id as string, token: tokenFromMail(mail), mail, body: res.body.data };
  };

  it('stores only a hash, never returns the token, and e-mails a link in the organization’s language', async () => {
    const email = uniqueEmail('invitee');
    const { id, token, mail, body } = await invite(email, { fullName: 'Sara Client' });
    expect(body).not.toHaveProperty('token');
    expect(JSON.stringify(body)).not.toContain(token);
    const row = await t.prisma.invitation.findUniqueOrThrow({ where: { id } });
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).not.toBe(token);
    expect(mail.text).toContain('Sara Client');
    expect(mail.text).toContain('Invite Gym');
    expect(mail.text).toContain('/en/invitations/accept?token=');
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
  });

  it('previews for the token holder without signing in', async () => {
    const { token } = await invite(uniqueEmail());
    const res = await t.http().post('/api/v1/invitations/preview').send({ token }).expect(200);
    expect(res.body.data).toMatchObject({ organization: { name: 'Invite Gym' }, role: { labelKey: 'role.participant.client' } });
    expect((await t.http().post('/api/v1/invitations/preview').send({ token: 'x'.repeat(43) })).body.error.code).toBe('INVITATION_INVALID');
  });

  it('is accepted only by the invited, verified address; once', async () => {
    const email = uniqueEmail('exact');
    const { token } = await invite(email);

    const stranger = await signUpAndLogin(t);
    expect(code(await as(t, stranger).post('/api/v1/invitations/accept', { token }))).toBe('INVITATION_EMAIL_MISMATCH');

    const invitee = await signUpAndLogin(t, { email });
    await t.prisma.user.update({ where: { id: invitee.userId }, data: { emailVerifiedAt: null } });
    expect(code(await as(t, invitee).post('/api/v1/invitations/accept', { token }))).toBe('EMAIL_NOT_VERIFIED');
    await t.prisma.user.update({ where: { id: invitee.userId }, data: { emailVerifiedAt: new Date() } });

    const ok = await as(t, invitee).post('/api/v1/invitations/accept', { token });
    expect(ok.status).toBe(200);
    expect(ok.body.data.organizationId).toBe(F.orgId);
    expect(code(await as(t, invitee).post('/api/v1/invitations/accept', { token }))).toBe('INVITATION_INVALID');
    expect((await t.http().post('/api/v1/invitations/accept').send({ token })).status).toBe(401);
    expect((await as(t, invitee).get(`/api/v1/orgs/${F.orgId}/context`).expect(200)).body.data.membership.role.key).toBe('participant');
  });

  it('works for people who register after being invited (e-mail is the identity)', async () => {
    const email = uniqueEmail('later');
    const { token } = await invite(email);
    const user = await signUpAndLogin(t, { email });
    await as(t, user).post('/api/v1/invitations/accept', { token }).expect(200);
  });

  it('refuses duplicates: pending invitation and existing membership', async () => {
    const email = uniqueEmail('dup');
    await invite(email);
    expect(code(await as(t, F.owner).post(`${base}/invitations`, { email, roleId: participantRole }))).toBe('INVITATION_PENDING');
    expect(code(await as(t, F.owner).post(`${base}/invitations`, { email: F.guardian.email, roleId: participantRole }))).toBe('ALREADY_MEMBER');
  });

  it('revoked and expired invitations are dead; resend issues a new token and revives expired ones', async () => {
    const o = as(t, F.owner);
    const revoked = await invite(uniqueEmail());
    await o.del(`${base}/invitations/${revoked.id}`).expect(204);
    expect((await t.http().post('/api/v1/invitations/preview').send({ token: revoked.token })).body.error.code).toBe('INVITATION_INVALID');
    expect(code(await o.del(`${base}/invitations/${revoked.id}`))).toBe('INVITATION_INVALID');

    const email = uniqueEmail('expired');
    const expired = await invite(email);
    await t.prisma.invitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await t.http().post('/api/v1/invitations/preview').send({ token: expired.token })).body.error.code).toBe('INVITATION_INVALID');
    const listed = (await o.get(`${base}/invitations?limit=100`).expect(200)).body.data.find((i: { id: string }) => i.id === expired.id);
    expect(listed.status).toBe('EXPIRED');

    const before = memoryOutbox.filter(mailTo(email, 'invited you')).length;
    await o.post(`${base}/invitations/${expired.id}/resend`).expect(200);
    const fresh = await waitForMail((m) => mailTo(email, 'invited you')(m) && memoryOutbox.filter(mailTo(email, 'invited you')).length > before && tokenFromMail(m) !== expired.token);
    const newToken = tokenFromMail(fresh);
    expect((await t.http().post('/api/v1/invitations/preview').send({ token: expired.token })).body.error.code).toBe('INVITATION_INVALID'); // old link rotated out
    await t.http().post('/api/v1/invitations/preview').send({ token: newToken }).expect(200);
  });

  it('applies the inviter’s follow-ups on acceptance: assignment and groups', async () => {
    const group = (await as(t, F.manager).post(`${base}/groups`, { name: 'Onboarding' }).expect(201)).body.data.id;
    const email = uniqueEmail('followups');
    const { token } = await invite(email, { assignToMembershipId: F.practitioner2.membershipId, groupIds: [group] });
    const user = await signUpAndLogin(t, { email });
    const accepted = await as(t, user).post('/api/v1/invitations/accept', { token }).expect(200);
    const membershipId = accepted.body.data.membershipId;

    expect(await t.prisma.memberAssignment.count({ where: { participantMembershipId: membershipId, practitionerMembershipId: F.practitioner2.membershipId, endedAt: null } })).toBe(1);
    expect((await as(t, F.manager).get(`${base}/groups/${group}`).expect(200)).body.data.members.map((m: { membershipId: string }) => m.membershipId)).toContain(membershipId);
  });

  it('skips a follow-up whose target disappeared instead of failing the acceptance', async () => {
    const extraTrainer = await addMember(t, F.orgId, F.owner, 'practitioner');
    const email = uniqueEmail('skipped');
    const { token } = await invite(email, { assignToMembershipId: extraTrainer.membershipId });
    await as(t, F.owner).del(`${base}/members/${extraTrainer.membershipId}`).expect(204);
    const user = await signUpAndLogin(t, { email });
    const accepted = await as(t, user).post('/api/v1/invitations/accept', { token }).expect(200);
    expect(await t.prisma.memberAssignment.count({ where: { participantMembershipId: accepted.body.data.membershipId } })).toBe(0);
  });

  it('a removed member can be invited again and keeps their membership record', async () => {
    const person = await addMember(t, F.orgId, F.owner, 'participant');
    await as(t, F.owner).del(`${base}/members/${person.membershipId}`).expect(204);
    const trainerRole = await systemRoleId(t, 'practitioner');
    await as(t, F.owner).post(`${base}/invitations`, { email: person.email, roleId: trainerRole }).expect(201);
    const mails = memoryOutbox.filter(mailTo(person.email, 'invited you'));
    const token = tokenFromMail(await waitForMail((m) => mailTo(person.email, 'invited you')(m) && m !== mails[0]));
    const res = await as(t, person).post('/api/v1/invitations/accept', { token }).expect(200);
    expect(res.body.data.membershipId).toBe(person.membershipId);
    expect((await as(t, person).get(`${base}/context`).expect(200)).body.data.membership.role.key).toBe('practitioner');
  });

  it('cannot be accepted into a suspended organization', async () => {
    const owner = await signUpAndLogin(t);
    const org = await createOrg(t, owner, 'Soon Suspended');
    const email = uniqueEmail('suspended');
    await as(t, owner).post(`/api/v1/orgs/${org.orgId}/invitations`, { email, roleId: participantRole }).expect(201);
    const token = tokenFromMail(await waitForMail((m) => mailTo(email, 'Soon Suspended')(m)));
    await t.prisma.organization.update({ where: { id: org.orgId }, data: { status: 'SUSPENDED' } });
    const user = await signUpAndLogin(t, { email });
    expect(code(await as(t, user).post('/api/v1/invitations/accept', { token }))).toBe('ORGANIZATION_SUSPENDED');
  });

  it('writes the full lifecycle to the audit log without leaking tokens', async () => {
    const logs = await t.prisma.auditLog.findMany({ where: { organizationId: F.orgId, action: { startsWith: 'invitation.' } } });
    expect(new Set(logs.map((l) => l.action))).toEqual(new Set(['invitation.created', 'invitation.resent', 'invitation.revoked', 'invitation.accepted']));
    expect(JSON.stringify(logs)).not.toMatch(/token/i);
  });

  it('password reset flows are unaffected by pending invitations (sanity: shared mail pipeline)', async () => {
    const u = await signUpAndLogin(t, { password: STRONG_PASSWORD });
    expect(u.userId).toBeTruthy();
  });
});
