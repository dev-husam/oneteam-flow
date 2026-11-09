import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '../src/common/context/request-context.js';
import { TenantIsolationError, TenantPrismaService, runInTenant } from '../src/core/tenancy/tenant-prisma.service.js';
import { as, buildOrg, createTestApp, type OrgFixture, type TestApp } from './helpers/app.js';

const ctx = (orgId: string): TenantContext => ({ orgId, membershipId: 'm', roleId: 'r', roleKey: 'owner', roleRank: 100, grants: {} });

/** Layer 2 (scoped client) and layer 3 (composite foreign keys) against the real database. */
describe('tenant-scoped Prisma client and schema-level isolation', () => {
  let t: TestApp;
  let db: TenantPrismaService['db'];
  let A: OrgFixture;
  let B: OrgFixture;
  const inA = <T>(fn: () => T) => runInTenant(ctx(A.orgId), fn);

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get(TenantPrismaService).db;
    A = await buildOrg(t, 'Client Test A');
    B = await buildOrg(t, 'Client Test B');
    await as(t, B.owner).post(`/api/v1/orgs/${B.orgId}/groups`, { name: 'B group' }).expect(201);
  });
  afterAll(async () => t.app.close());

  it('throws without a tenant context instead of returning everything', async () => {
    await expect(db.membership.findMany()).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(db.group.create({ data: { name: 'x', organizationId: A.orgId, createdByMembershipId: A.owner.membershipId } })).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it('only returns rows of the current organization, for every read operation', async () => {
    const expected = await t.prisma.membership.count({ where: { organizationId: A.orgId } });
    expect(await inA(() => db.membership.count())).toBe(expected);
    const rows = await inA(() => db.membership.findMany());
    expect(rows.every((r) => r.organizationId === A.orgId)).toBe(true);
    expect(await inA(() => db.membership.findFirst({ where: { organizationId: B.orgId } }))).toBeNull(); // conflicting filter cannot widen
    expect(await inA(() => db.membership.findUnique({ where: { id: B.owner.membershipId } }))).toBeNull();
    expect(await inA(() => db.membership.findUnique({ where: { organizationId_userId: { organizationId: B.orgId, userId: B.owner.userId } } }))).toBeNull();
    expect(await inA(() => db.group.findMany())).toEqual([]);
    expect(await inA(() => db.membership.aggregate({ _count: { _all: true } }))).toEqual({ _count: { _all: expected } });
    const grouped = await inA(() => db.membership.groupBy({ by: ['status'], _count: { _all: true } }));
    expect(grouped.reduce((n, g) => n + g._count._all, 0)).toBe(expected);
  });

  it('cannot modify or delete another organization’s rows', async () => {
    const target = B.participant.membershipId;
    await expect(inA(() => db.membership.update({ where: { id: target }, data: { status: 'SUSPENDED' } }))).rejects.toThrow();
    expect((await inA(() => db.membership.updateMany({ where: { id: target }, data: { status: 'SUSPENDED' } }))).count).toBe(0);
    await expect(inA(() => db.membership.delete({ where: { id: target } }))).rejects.toThrow();
    expect((await inA(() => db.membership.deleteMany({ where: { id: target } }))).count).toBe(0);
    expect((await t.prisma.membership.findUniqueOrThrow({ where: { id: target } })).status).toBe('ACTIVE');
  });

  it('cannot create rows for another organization or move rows between organizations', async () => {
    const data = { name: 'sneaky', createdByMembershipId: B.owner.membershipId };
    await expect(inA(() => db.group.create({ data: { ...data, organizationId: B.orgId } }))).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(inA(() => db.group.createMany({ data: [{ ...data, organizationId: A.orgId }, { ...data, organizationId: B.orgId }] }))).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(inA(() => db.membership.update({ where: { id: A.guardian.membershipId }, data: { organizationId: B.orgId } }))).rejects.toBeInstanceOf(TenantIsolationError);
    expect(await t.prisma.group.count({ where: { name: 'sneaky' } })).toBe(0);
  });

  it('a created row can reference only rows of its own organization (composite FK, even through the scoped client)', async () => {
    // organization is forced to A, but the creator membership belongs to B: the database refuses the pair
    await expect(inA(() => db.group.create({ data: { name: 'cross', organizationId: A.orgId, createdByMembershipId: B.owner.membershipId } }))).rejects.toThrow();
    expect(await t.prisma.group.count({ where: { name: 'cross' } })).toBe(0);
  });

  it('refuses models that are not organization data', async () => {
    const client = db as unknown as Record<string, { findMany(): Promise<unknown> }>;
    for (const model of ['user', 'role', 'permission', 'userSession']) {
      await expect(inA(() => client[model]!.findMany())).rejects.toBeInstanceOf(TenantIsolationError);
    }
  });

  it('keeps the scope inside interactive transactions', async () => {
    const result = await inA(() =>
      db.$transaction(async (tx) => {
        const group = await tx.group.create({ data: { name: 'tx group', organizationId: A.orgId, createdByMembershipId: A.owner.membershipId } });
        const seen = await tx.membership.findMany();
        const foreign = await tx.membership.findUnique({ where: { id: B.owner.membershipId } });
        return { group, seen, foreign };
      }),
    );
    expect(result.group.organizationId).toBe(A.orgId);
    expect(result.seen.every((m) => m.organizationId === A.orgId)).toBe(true);
    expect(result.foreign).toBeNull();
  });

  it('the Organization row is reachable only by its own id', async () => {
    const mine = await inA(() => db.organization.findMany());
    expect(mine.map((o) => o.id)).toEqual([A.orgId]);
    expect(await inA(() => db.organization.findUnique({ where: { id: B.orgId } }))).toBeNull();
    await expect(inA(() => db.organization.update({ where: { id: B.orgId }, data: { name: 'hijacked' } }))).rejects.toThrow();
  });

  describe('composite foreign keys reject cross-organization references written with raw SQL', () => {
    const exec = (sql: string, ...params: unknown[]) => t.prisma.$executeRawUnsafe(sql, ...params);

    it('group_members', async () => {
      const groupA = (await as(t, A.owner).post(`/api/v1/orgs/${A.orgId}/groups`, { name: 'fk group' }).expect(201)).body.data.id;
      const groupB = (await t.prisma.group.findFirstOrThrow({ where: { organizationId: B.orgId } })).id;
      const sql = 'INSERT INTO group_members (group_id, membership_id, organization_id, added_at) VALUES (?, ?, ?, NOW(3))';
      await expect(exec(sql, groupB, A.guardian.membershipId, A.orgId)).rejects.toThrow(); // group of B, member of A, row says A
      await expect(exec(sql, groupA, B.guardian.membershipId, A.orgId)).rejects.toThrow(); // member of B
      await expect(exec(sql, groupA, A.guardian.membershipId, B.orgId)).rejects.toThrow(); // wrong organization on the row
      await expect(exec(sql, groupA, A.guardian.membershipId, A.orgId)).resolves.toBe(1); // control: same organization works
    });

    it('member_assignments', async () => {
      const sql = `INSERT INTO member_assignments (id, organization_id, practitioner_membership_id, participant_membership_id, kind, active_key, started_at, created_by_membership_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 'SECONDARY', ?, NOW(3), ?, NOW(3), NOW(3))`;
      await expect(exec(sql, randomUUID(), A.orgId, A.practitioner.membershipId, B.participant.membershipId, 'k1', A.owner.membershipId)).rejects.toThrow();
      await expect(exec(sql, randomUUID(), A.orgId, B.practitioner.membershipId, A.participant.membershipId, 'k2', A.owner.membershipId)).rejects.toThrow();
      await expect(exec(sql, randomUUID(), A.orgId, A.practitioner.membershipId, A.participant.membershipId, 'k3', B.owner.membershipId)).rejects.toThrow();
      await expect(exec(sql, randomUUID(), A.orgId, A.practitioner2.membershipId, A.participant2.membershipId, 'k4', A.owner.membershipId)).resolves.toBe(1);
    });

    it('invitations and groups reference only memberships of their own organization', async () => {
      const inv = `INSERT INTO invitations (id, organization_id, email, role_id, invited_by_membership_id, token_hash, status, expires_at, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NOW(3), NOW(3), NOW(3))`;
      const role = (await t.prisma.role.findFirstOrThrow({ where: { key: 'participant', organizationId: null } })).id;
      await expect(exec(inv, randomUUID(), A.orgId, 'x@x.test', role, B.owner.membershipId, 'a'.repeat(64))).rejects.toThrow();
      await expect(exec(inv, randomUUID(), A.orgId, 'x@x.test', role, A.owner.membershipId, 'b'.repeat(64))).resolves.toBe(1);
      await expect(exec('INSERT INTO groups (id, organization_id, name, created_by_membership_id, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(3), NOW(3))', randomUUID(), A.orgId, 'raw', B.owner.membershipId)).rejects.toThrow();
    });

    it('memberships are unique per user and organization', async () => {
      await expect(t.prisma.membership.create({ data: { organizationId: A.orgId, userId: A.guardian.userId, roleId: (await t.prisma.role.findFirstOrThrow({ where: { key: 'guardian' } })).id } })).rejects.toThrow();
    });
  });
});
