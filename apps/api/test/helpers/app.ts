import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { isRetiredRole } from '@pt/domain';
import { stepAt, totpForStep } from '../../src/core/auth/mfa/totp.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/bootstrap.js';
import { memoryOutbox, type OutgoingMail } from '../../src/infra/mail/mail.service.js';
import { PrismaService } from '../../src/infra/prisma/prisma.service.js';

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register({ withWorker: true })] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  // Custom roles are off by default (product decision); the authorization suites exercise them, so the test database turns them on.
  // Tests that need them off use a per-organization override.
  await app.get(PrismaService).featureFlag.update({ where: { key: 'custom_roles' }, data: { enabled: true } });
  return {
    app,
    prisma: app.get(PrismaService),
    http: () => request(app.getHttpServer()),
  };
}

let counter = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}.${Date.now()}.${counter++}@example.test`;

export const STRONG_PASSWORD = 'correct horse battery staple';

/** Waits until the worker has "sent" a message matching the predicate. */
export async function waitForMail(match: (m: OutgoingMail) => boolean, timeoutMs = 8_000): Promise<OutgoingMail> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = memoryOutbox.find(match);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Timed out waiting for mail');
}

export const mailTo = (email: string, subjectPart: string) => (m: OutgoingMail) =>
  m.to === email && m.subject.includes(subjectPart);

export const tokenFromMail = (mail: OutgoingMail): string => {
  const match = mail.text.match(/token=([^\s&]+)/);
  if (!match?.[1]) throw new Error('No token in mail');
  return decodeURIComponent(match[1]);
};

export interface Session {
  email: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  userId: string;
}

/** Registers, verifies the e-mail and signs in as a native (iOS) client. */
export async function signUpAndLogin(t: TestApp, opts: { email?: string; password?: string; client?: string } = {}): Promise<Session> {
  const email = opts.email ?? uniqueEmail();
  const password = opts.password ?? STRONG_PASSWORD;
  await t.http().post('/api/v1/auth/register').send({ fullName: 'Test User', email, password, acceptTerms: true }).expect(202);
  const verify = await waitForMail(mailTo(email, 'Confirm'));
  await t.http().post('/api/v1/auth/verify-email').send({ token: tokenFromMail(verify) }).expect(200);
  const res = await t
    .http()
    .post('/api/v1/auth/login')
    .set('x-client-type', opts.client ?? 'ios')
    .send({ email, password })
    .expect(200);
  return {
    email,
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
    sessionId: res.body.data.sessionId,
    userId: res.body.data.user.id,
  };
}

export const bearer = (s: { accessToken: string }) => ({ Authorization: `Bearer ${s.accessToken}` });

// ======================================================================= Phase 2 helpers


export interface MemberSession extends Session {
  membershipId: string;
}

export interface Api {
  get(path: string): request.Test;
  post(path: string, body?: object): request.Test;
  patch(path: string, body?: object): request.Test;
  put(path: string, body?: object): request.Test;
  del(path: string, body?: object): request.Test;
}

/** Authenticated request helper for one signed-in user. */
export function as(t: TestApp, s: { accessToken: string }): Api {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${s.accessToken}`);
  return {
    get: (p) => auth(t.http().get(p)),
    post: (p, b) => auth(t.http().post(p)).send(b ?? {}),
    patch: (p, b) => auth(t.http().patch(p)).send(b ?? {}),
    put: (p, b) => auth(t.http().put(p)).send(b ?? {}),
    del: (p, b) => auth(t.http().delete(p)).send(b ?? {}),
  };
}

export const systemRoleId = async (t: TestApp, key: string): Promise<string> =>
  (await t.prisma.role.findUniqueOrThrow({ where: { scopeKey_key: { scopeKey: 'system', key } } })).id;

export async function createOrg(t: TestApp, owner: Session, name = 'Iron Gym', extra: object = {}): Promise<{ orgId: string; slug: string; membershipId: string }> {
  const res = await as(t, owner).post('/api/v1/orgs', { name, categoryKey: 'fitness', slug: `org-${Date.now().toString(36)}-${counter++}`, ...extra });
  if (res.status !== 201) throw new Error(`createOrg failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { orgId: res.body.data.organization.id, slug: res.body.data.organization.slug, membershipId: res.body.data.membershipId };
}

/** Invites a fresh user with a system role, accepts as that user, and returns their session. */
export async function addMember(
  t: TestApp,
  orgId: string,
  inviter: Session,
  roleKey: string,
  opts: { assignToMembershipId?: string; groupIds?: string[]; roleId?: string } = {},
): Promise<MemberSession> {
  const user = await signUpAndLogin(t);
  const roleId = opts.roleId ?? (await systemRoleId(t, roleKey));
  if (isRetiredRole(roleKey)) {
    // Retired roles (admin, manager) can no longer be handed out through the API; the authorization suite still
    // needs members who hold them, so the fixture writes the membership directly.
    const created = await t.prisma.membership.create({ data: { organizationId: orgId, userId: user.userId, roleId, activeUserKey: user.userId } });
    return { ...user, membershipId: created.id };
  }
  const inv = await as(t, inviter).post(`/api/v1/orgs/${orgId}/invitations`, { email: user.email, roleId, assignToMembershipId: opts.assignToMembershipId, groupIds: opts.groupIds });
  if (inv.status !== 201) throw new Error(`invite failed: ${inv.status} ${JSON.stringify(inv.body)}`);
  const mail = await waitForMail(mailTo(user.email, 'invited you'));
  const accepted = await as(t, user).post('/api/v1/invitations/accept', { token: tokenFromMail(mail) });
  if (accepted.status !== 200) throw new Error(`accept failed: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  return { ...user, membershipId: accepted.body.data.membershipId };
}

export interface OrgFixture {
  orgId: string;
  owner: MemberSession;
  admin: MemberSession;
  manager: MemberSession;
  practitioner: MemberSession;
  practitioner2: MemberSession;
  /** Assigned to `practitioner`. */
  participant: MemberSession;
  /** Not assigned to anyone. */
  participant2: MemberSession;
  guardian: MemberSession;
}

/** One organization with a member of every system role. */
export async function buildOrg(t: TestApp, name = 'Fixture Gym', extra: object = {}): Promise<OrgFixture> {
  const ownerUser = await signUpAndLogin(t);
  const org = await createOrg(t, ownerUser, name, extra);
  const owner: MemberSession = { ...ownerUser, membershipId: org.membershipId };
  const admin = await addMember(t, org.orgId, owner, 'admin');
  const manager = await addMember(t, org.orgId, owner, 'manager');
  const practitioner = await addMember(t, org.orgId, owner, 'practitioner');
  const practitioner2 = await addMember(t, org.orgId, owner, 'practitioner');
  const participant = await addMember(t, org.orgId, owner, 'participant', { assignToMembershipId: practitioner.membershipId });
  const participant2 = await addMember(t, org.orgId, owner, 'participant');
  const guardian = await addMember(t, org.orgId, owner, 'guardian');
  return { orgId: org.orgId, owner, admin, manager, practitioner, practitioner2, participant, participant2, guardian };
}

/** A valid TOTP code for the secret, using the next time step so it can follow one already used. */
export const totpCode = (secret: string, stepOffset = 0): string => totpForStep(secret, stepAt(Date.now()) + stepOffset);

/** Enables MFA for a signed-in session (enroll + confirm). Returns the secret and recovery codes. */
export async function enableMfa(t: TestApp, s: Session): Promise<{ secret: string; recoveryCodes: string[] }> {
  const enroll = await as(t, s).post('/api/v1/me/mfa/enroll').expect(200);
  const secret = enroll.body.data.secret as string;
  const confirm = await as(t, s).post('/api/v1/me/mfa/confirm', { code: totpCode(secret) }).expect(200);
  return { secret, recoveryCodes: confirm.body.data.recoveryCodes };
}

/** Grants the platform role and enables MFA: the session can then call /admin. */
export async function makeSuperAdmin(t: TestApp, s: Session): Promise<void> {
  const role = await t.prisma.role.findUniqueOrThrow({ where: { scopeKey_key: { scopeKey: 'platform', key: 'super_admin' } } });
  await t.prisma.platformRoleAssignment.create({ data: { userId: s.userId, roleId: role.id } });
  await enableMfa(t, s);
}

// ======================================================================= Phase 5 helpers

/** A real 1×1 PNG (uploads are now parsed to remove metadata, so truncated fixtures are rejected). */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
export const PDF = Buffer.from('%PDF-1.7\n%test document\n');

/** Full upload flow through the real API: request URL → PUT bytes to the signed URL → complete. */
export async function uploadFile(t: TestApp, s: { accessToken: string }, orgId: string, bytes: Buffer, mimeType: string, fileName = 'file.bin', sensitivity?: 'STANDARD' | 'SENSITIVE'): Promise<{ id: string; status: string }> {
  const req = await as(t, s).post(`/api/v1/orgs/${orgId}/files/uploads`, { fileName, mimeType, sizeBytes: bytes.length, sensitivity }).expect(201);
  const { upload, file } = req.body.data;
  const path = new URL(upload.url).pathname;
  await t.http().put(path).set('Content-Type', mimeType).send(bytes).expect(200);
  const done = await as(t, s).post(`/api/v1/orgs/${orgId}/files/${file.id}/complete`);
  if (done.status !== 200) throw new Error(`complete failed: ${done.status} ${JSON.stringify(done.body)}`);
  return done.body.data;
}

export async function createMetric(t: TestApp, s: { accessToken: string }, orgId: string, key = 'body_mass_kg', higherIsBetter: boolean | undefined = false): Promise<{ id: string }> {
  const res = await as(t, s).post(`/api/v1/orgs/${orgId}/progress/metrics`, { key, name: 'Weight', unit: 'kg', higherIsBetter });
  if (res.status !== 201) throw new Error(`createMetric failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

// ======================================================================= Phase 6b helpers

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
export const GPS_MARKER = 'GPS-LAT-48.8584N-2.2945E';

/** A minimal JPEG whose EXIF holds an orientation (6 = rotated) and a GPS position, to prove both what is removed and what is kept. */
export function jpegWithGps(): Buffer {
  const exif = [...ascii('Exif'), 0, 0, ...ascii('MM'), 0, 42, 0, 0, 0, 8, 0, 2, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0x88, 0x25, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0x1a, 0, 0, 0, 0, ...ascii(GPS_MARKER)];
  return Buffer.from([0xff, 0xd8, ...seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), ...seg(0xe1, exif), ...seg(0xdb, [0, 1, 2, 3, 4, 5, 6, 7]), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9]);
}
