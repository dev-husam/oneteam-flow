import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_CLASSIFIED, ALL_PRISMA_MODELS, GLOBAL_MODELS, MIXED_MODELS, ROOT_MODELS, TENANT_MODELS } from './tenant-models.js';
import { TenantIsolationError, scopeArgs } from './tenant-prisma.service.js';

const ORG = 'org-a';

describe('model classification', () => {
  it('classifies every Prisma model exactly once: a new table cannot ship without a tenancy decision', () => {
    const all = [...TENANT_MODELS, ...ROOT_MODELS, ...MIXED_MODELS, ...GLOBAL_MODELS];
    expect(new Set(all).size, 'a model is listed twice').toBe(all.length);
    expect([...ALL_PRISMA_MODELS].sort()).toEqual([...ALL_CLASSIFIED].sort());
  });

  it('every TENANT model has organizationId in the schema', () => {
    const schema = readFileSync(join(import.meta.dirname, '../../../prisma/schema.prisma'), 'utf8');
    for (const model of TENANT_MODELS) {
      const block = schema.match(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
      expect(block, model).toMatch(/organizationId\s+String\s+@map\("organization_id"\)/);
    }
  });
});

describe('scopeArgs', () => {
  it('refuses to run without a tenant context', () => {
    expect(() => scopeArgs('Membership', 'findMany', {}, undefined)).toThrow(TenantIsolationError);
  });

  it('refuses models that are not organization data', () => {
    for (const model of ['User', 'Role', 'Permission', 'UserSession']) {
      expect(() => scopeArgs(model, 'findMany', {}, ORG)).toThrow(/not available through the tenant-scoped client/);
    }
  });

  it('ANDs the organization into every read, even when the caller supplied a conflicting filter', () => {
    const args = scopeArgs('Membership', 'findMany', { where: { organizationId: 'org-b' } }, ORG);
    expect(args).toEqual({ where: { AND: [{ organizationId: 'org-b' }, { organizationId: ORG }] } });
    expect(scopeArgs('Group', 'findMany', undefined, ORG)).toEqual({ where: { organizationId: ORG } });
    expect(scopeArgs('Group', 'count', {}, ORG)).toEqual({ where: { organizationId: ORG } });
  });

  it('keeps an existing AND and a compound unique key intact', () => {
    const out = scopeArgs('Membership', 'findUnique', { where: { organizationId_userId: { organizationId: 'org-b', userId: 'u' }, AND: [{ status: 'ACTIVE' }] } }, ORG) as { where: Record<string, unknown> };
    expect(out.where.organizationId_userId).toEqual({ organizationId: 'org-b', userId: 'u' });
    expect(out.where.AND).toEqual([{ status: 'ACTIVE' }, { organizationId: ORG }]);
  });

  it('ANDs the organization into unique lookups, updates and deletes (a foreign id simply is not found)', () => {
    for (const op of ['findUnique', 'findUniqueOrThrow', 'update', 'delete']) {
      const out = scopeArgs('Invitation', op, { where: { id: 'x' }, data: {} }, ORG) as { where: unknown };
      // unique field stays at the top level; the tenant filter rides along in AND
      expect(out.where).toEqual({ id: 'x', AND: [{ organizationId: ORG }] });
    }
    for (const op of ['updateMany', 'deleteMany']) {
      expect((scopeArgs('Group', op, { where: { name: 'n' }, data: {} }, ORG) as { where: unknown }).where).toEqual({ AND: [{ name: 'n' }, { organizationId: ORG }] });
    }
  });

  it('forces the organization on create and rejects other organizations or relation form', () => {
    expect(scopeArgs('Group', 'create', { data: { name: 'g' } }, ORG)).toEqual({ data: { name: 'g', organizationId: ORG } });
    expect(scopeArgs('Group', 'create', { data: { name: 'g', organizationId: ORG } }, ORG)).toEqual({ data: { name: 'g', organizationId: ORG } });
    expect(() => scopeArgs('Group', 'create', { data: { name: 'g', organizationId: 'org-b' } }, ORG)).toThrow(TenantIsolationError);
    expect(() => scopeArgs('Group', 'create', { data: { name: 'g', organization: { connect: { id: 'org-b' } } } }, ORG)).toThrow(TenantIsolationError);
  });

  it('checks every row of createMany', () => {
    expect(scopeArgs('GroupMember', 'createMany', { data: [{ groupId: 'g1' }, { groupId: 'g2' }] }, ORG)).toEqual({
      data: [{ groupId: 'g1', organizationId: ORG }, { groupId: 'g2', organizationId: ORG }],
    });
    expect(() => scopeArgs('GroupMember', 'createMany', { data: [{ groupId: 'g1' }, { groupId: 'g2', organizationId: 'org-b' }] }, ORG)).toThrow(TenantIsolationError);
  });

  it('refuses updates that move a row to another organization', () => {
    expect(() => scopeArgs('Membership', 'update', { where: { id: 'x' }, data: { organizationId: 'org-b' } }, ORG)).toThrow(TenantIsolationError);
    expect(() => scopeArgs('Membership', 'update', { where: { id: 'x' }, data: { organizationId: { set: 'org-b' } } }, ORG)).toThrow(TenantIsolationError);
    expect(() => scopeArgs('Membership', 'updateMany', { where: {}, data: { organization: { connect: { id: 'org-b' } } } }, ORG)).toThrow(TenantIsolationError);
  });

  it('upsert is scoped on where and create, and cannot change the organization', () => {
    const out = scopeArgs('Group', 'upsert', { where: { id: 'x' }, create: { name: 'n' }, update: { name: 'm' } }, ORG) as { where: unknown; create: unknown };
    expect(out.where).toEqual({ id: 'x', AND: [{ organizationId: ORG }] });
    expect(out.create).toEqual({ name: 'n', organizationId: ORG });
    expect(() => scopeArgs('Group', 'upsert', { where: { id: 'x' }, create: {}, update: { organizationId: 'org-b' } }, ORG)).toThrow(TenantIsolationError);
  });

  it('the Organization root is scoped by its own id and cannot be created or deleted from a tenant context', () => {
    expect(scopeArgs('Organization', 'findFirst', {}, ORG)).toEqual({ where: { id: ORG } });
    // a foreign id stays in the key and the own-id filter rides along: the combination can never match
    expect((scopeArgs('Organization', 'update', { where: { id: 'org-b' }, data: { name: 'x' } }, ORG) as { where: unknown }).where).toEqual({ id: 'org-b', AND: [{ id: ORG }] });
    expect(() => scopeArgs('Organization', 'create', { data: {} }, ORG)).toThrow(TenantIsolationError);
    expect(() => scopeArgs('Organization', 'upsert', {}, ORG)).toThrow(TenantIsolationError);
  });

  it('audit rows are append-only inside a tenant context', () => {
    expect(scopeArgs('AuditLog', 'create', { data: { action: 'a' } }, ORG)).toEqual({ data: { action: 'a', organizationId: ORG } });
    expect(scopeArgs('AuditLog', 'findMany', {}, ORG)).toEqual({ where: { organizationId: ORG } });
    for (const op of ['update', 'updateMany', 'delete', 'deleteMany', 'upsert']) {
      expect(() => scopeArgs('AuditLog', op, { where: {}, data: {} }, ORG)).toThrow(TenantIsolationError);
    }
  });

  it('rejects unknown operations instead of passing them through', () => {
    expect(() => scopeArgs('Group', 'findRaw', {}, ORG)).toThrow(TenantIsolationError);
    expect(() => scopeArgs('Group', 'aggregateRaw', {}, ORG)).toThrow(TenantIsolationError);
  });
});

describe('architecture: who may use the unscoped Prisma client', () => {
  const SRC = join(import.meta.dirname, '../..');
  const ALLOWED_DIRS = [
    'infra', 'cli',
    'capabilities/notifications', 'capabilities/progress', 'capabilities/messaging/realtime', 'modules/fitness/exercises', 'modules/fitness/reminders', 'modules/coaching/reminders', 'core/auth', 'core/users', 'core/rbac', 'core/roles', 'core/organizations', 'core/invitations', 'core/audit', 'core/tenancy', 'core/platform-admin',
  ];
  const UNSCOPED_IMPORT = /infra\/prisma\/prisma\.service\.js'/;
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? (f === 'generated' ? [] : files(p)) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
    });

  it('only allow-listed modules import PrismaService; tenant-data modules must use TenantPrismaService', () => {
    const offenders = files(SRC)
      .filter((f) => UNSCOPED_IMPORT.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f))
      .filter((f) => !ALLOWED_DIRS.some((d) => f.startsWith(d + '/')) && f !== 'bootstrap.ts');
    expect(offenders).toEqual([]);
  });

  it('tenant-data modules (members, groups, assignments, tasks, files, activity) never touch the unscoped client', () => {
    for (const dir of ['core/members', 'core/groups', 'core/assignments', 'capabilities/tasks', 'capabilities/files', 'capabilities/activity', 'modules/fitness/clients', 'modules/fitness/plans', 'modules/fitness/workouts', 'modules/fitness/nutrition', 'modules/fitness/checkins', 'modules/fitness/reach', 'modules/coaching/sessions', 'modules/coaching/notes', 'modules/coaching/assessments', 'modules/coaching/resources', 'capabilities/messaging']) {
      // the realtime gateway is the one place that must look across organizations (sessions, memberships): its own allow-listed folder
      for (const f of files(join(SRC, dir)).filter((x) => !x.includes('/messaging/realtime/'))) {
        expect(readFileSync(f, 'utf8'), f).not.toMatch(UNSCOPED_IMPORT);
      }
    }
  });

  it('no raw SQL in application code outside health checks', () => {
    const raw = files(SRC)
      .filter((f) => !relative(SRC, f).startsWith('infra/health'))
      .filter((f) => /\$(queryRaw|executeRaw)(Unsafe)?\b/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(raw).toEqual([]);
  });
});
