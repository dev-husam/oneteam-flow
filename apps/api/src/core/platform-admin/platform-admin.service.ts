import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { REDIS } from '../../infra/redis/redis.module.js';
import { QUEUES } from '../../infra/queue/queues.js';
import { AppError } from '../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage } from '../../common/pagination.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AdminAuditQuery, AdminListOrganizationsQuery, AdminListUsersQuery } from './platform-admin.dto.js';

/**
 * Platform-wide operations. Uses the unscoped client on purpose and never returns tenant CONTENT
 * (messages, photos, notes): only metadata and counts. Every write is audited as SUPER_ADMIN.
 */
@Injectable()
export class PlatformAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  private async auditAdmin(actorUserId: string, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>, orgId?: string, tx?: unknown) {
    await this.audit.record({ action, actorUserId, actorType: 'SUPER_ADMIN', organizationId: orgId ?? null, targetType, targetId, metadata }, tx);
  }

  /** Operational snapshot for the admin dashboard: dependencies, background queue depth, process memory. */
  async health() {
    const check = async (fn: () => Promise<unknown>) => fn().then(() => 'up' as const, () => 'down' as const);
    const [mysql, redis] = await Promise.all([check(() => this.prisma.platformModule.count()), check(() => this.redis.ping())]);
    const counts = redis === 'up' ? await this.emailQueue.getJobCounts('waiting', 'active', 'delayed', 'failed') : null;
    return {
      status: mysql === 'up' && redis === 'up' ? 'ok' : 'degraded',
      checks: { mysql, redis },
      queues: { email: counts },
      process: { uptimeSeconds: Math.round(process.uptime()), rssMb: Math.round(process.memoryUsage().rss / 1_048_576) },
    };
  }

  async stats() {
    const day = (n: number) => new Date(Date.now() - n * 86_400_000);
    const [users, suspendedUsers, newUsers7d, newUsers30d, orgsByStatus, activeMemberships, categories] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.user.count({ where: { createdAt: { gte: day(7) } } }),
      this.prisma.user.count({ where: { createdAt: { gte: day(30) } } }),
      this.prisma.organization.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.membership.count({ where: { status: 'ACTIVE' } }),
      this.prisma.organization.groupBy({ by: ['categoryId'], _count: { _all: true } }),
    ]);
    const categoryRows = await this.prisma.businessCategory.findMany({ select: { id: true, key: true } });
    return {
      users: { total: users, suspended: suspendedUsers, new7d: newUsers7d, new30d: newUsers30d },
      organizations: Object.fromEntries(orgsByStatus.map((o) => [o.status, o._count._all])),
      organizationsByCategory: Object.fromEntries(categories.map((c) => [categoryRows.find((r) => r.id === c.categoryId)?.key ?? c.categoryId, c._count._all])),
      activeMemberships,
    };
  }

  // ---------------------------------------------------------------- users

  async listUsers(q: AdminListUsersQuery) {
    const limit = pageSize(q);
    const rows = await this.prisma.user.findMany({
      where: { AND: [cursorWhere(q.cursor, 'asc'), q.status ? { status: q.status } : {}, q.q ? { OR: [{ fullName: { contains: q.q } }, { email: { contains: q.q.toLowerCase() } }] } : {}] },
      orderBy: { id: 'asc' }, take: limit + 1,
      select: { id: true, email: true, fullName: true, status: true, emailVerifiedAt: true, mfaEnabled: true, lastLoginAt: true, createdAt: true },
    });
    return toPage(rows, limit);
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, fullName: true, phone: true, status: true, emailVerifiedAt: true, mfaEnabled: true, lastLoginAt: true, createdAt: true,
        memberships: { select: { id: true, status: true, organization: { select: { id: true, name: true, slug: true } }, role: { select: { key: true } } } },
        platformRoles: { select: { role: { select: { key: true } } } },
      },
    });
    if (!user) throw new AppError('NOT_FOUND');
    return { ...user, platformRoles: user.platformRoles.map((r) => r.role.key) };
  }

  async setUserStatus(actorId: string, id: string, status: 'ACTIVE' | 'SUSPENDED') {
    if (id === actorId) throw new AppError('SELF_ACTION_FORBIDDEN');
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!user) throw new AppError('NOT_FOUND');
    if (status === 'SUSPENDED' && (await this.prisma.platformRoleAssignment.count({ where: { userId: id } })) > 0) {
      throw new AppError('PLATFORM_ROLE_INVALID', { reason: 'revoke_platform_role_first' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status } });
      if (status === 'SUSPENDED') {
        await tx.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'suspended_by_admin' } });
      }
      await this.auditAdmin(actorId, status === 'SUSPENDED' ? 'platform.user_suspended' : 'platform.user_activated', 'user', id, undefined, undefined, tx);
    });
    return this.getUser(id);
  }

  // ---------------------------------------------------------------- organizations

  async listOrganizations(q: AdminListOrganizationsQuery) {
    const limit = pageSize(q);
    const rows = await this.prisma.organization.findMany({
      where: { AND: [cursorWhere(q.cursor, 'asc'), q.status ? { status: q.status } : {}, q.categoryKey ? { category: { key: q.categoryKey } } : {}, q.q ? { OR: [{ name: { contains: q.q } }, { slug: { contains: q.q.toLowerCase() } }] } : {}] },
      orderBy: { id: 'asc' }, take: limit + 1,
      select: { id: true, name: true, slug: true, status: true, createdAt: true, category: { select: { key: true } }, _count: { select: { memberships: true } } },
    });
    const page = toPage(rows, limit);
    return { data: page.data.map((o) => ({ id: o.id, name: o.name, slug: o.slug, status: o.status, categoryKey: o.category.key, memberCount: o._count.memberships, createdAt: o.createdAt })), meta: page.meta };
  }

  async getOrganization(id: string) {
    const o = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true, name: true, slug: true, status: true, timezone: true, defaultLocale: true, createdAt: true, createdByUserId: true,
        category: { select: { key: true } },
        modules: { select: { enabled: true, module: { select: { key: true, status: true } } } },
        _count: { select: { memberships: true, invitations: true, groups: true } },
      },
    });
    if (!o) throw new AppError('NOT_FOUND');
    const byStatus = await this.prisma.membership.groupBy({ by: ['status'], where: { organizationId: id }, _count: { _all: true } });
    return { ...o, categoryKey: o.category.key, memberships: Object.fromEntries(byStatus.map((m) => [m.status, m._count._all])) };
  }

  async setOrganizationStatus(actorId: string, id: string, status: 'ACTIVE' | 'SUSPENDED') {
    const org = await this.prisma.organization.findUnique({ where: { id }, select: { id: true } });
    if (!org) throw new AppError('NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id }, data: { status } });
      await this.auditAdmin(actorId, status === 'SUSPENDED' ? 'platform.organization_suspended' : 'platform.organization_activated', 'organization', id, undefined, id, tx);
    });
    return this.getOrganization(id);
  }

  // ---------------------------------------------------------------- catalog

  async listCategories() {
    return this.prisma.businessCategory.findMany({ orderBy: { sortOrder: 'asc' }, select: { key: true, nameI18n: true, status: true, sortOrder: true, _count: { select: { organizations: true } } } });
  }

  async setCategoryStatus(actorId: string, key: string, status: 'ENABLED' | 'DISABLED') {
    const c = await this.prisma.businessCategory.findUnique({ where: { key } });
    if (!c) throw new AppError('NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      await tx.businessCategory.update({ where: { key }, data: { status } });
      await this.auditAdmin(actorId, 'platform.category_status_changed', 'category', c.id, { key, status }, undefined, tx);
    });
    return (await this.listCategories()).find((x) => x.key === key);
  }

  async listModules() {
    return this.prisma.platformModule.findMany({ orderBy: { key: 'asc' }, select: { key: true, nameI18n: true, status: true, _count: { select: { organizations: true } } } });
  }

  async setModuleStatus(actorId: string, key: string, status: 'ENABLED' | 'DISABLED') {
    const m = await this.prisma.platformModule.findUnique({ where: { key } });
    if (!m) throw new AppError('NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      await tx.platformModule.update({ where: { key }, data: { status } });
      await this.auditAdmin(actorId, 'platform.module_status_changed', 'module', m.id, { key, status }, undefined, tx);
    });
    return (await this.listModules()).find((x) => x.key === key);
  }

  // ---------------------------------------------------------------- platform roles

  async listPlatformRoles() {
    const roles = await this.prisma.role.findMany({
      where: { scopeType: 'PLATFORM' },
      select: { key: true, rank: true, permissions: { select: { permission: { select: { code: true } } } }, platformAssignments: { select: { grantedAt: true, user: { select: { id: true, email: true, fullName: true } } } } },
    });
    return roles.map((r) => ({ key: r.key, permissions: r.permissions.map((p) => p.permission.code), holders: r.platformAssignments.map((a) => ({ ...a.user, grantedAt: a.grantedAt })) }));
  }

  async grantPlatformRole(actorId: string, userId: string, roleKey: string) {
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } }),
      this.prisma.role.findUnique({ where: { scopeKey_key: { scopeKey: 'platform', key: roleKey } } }),
    ]);
    if (!user || user.status !== 'ACTIVE') throw new AppError('NOT_FOUND');
    if (!role) throw new AppError('PLATFORM_ROLE_INVALID');
    await this.prisma.$transaction(async (tx) => {
      await tx.platformRoleAssignment.upsert({ where: { userId_roleId: { userId, roleId: role.id } }, create: { userId, roleId: role.id, grantedByUserId: actorId }, update: {} });
      await this.auditAdmin(actorId, 'platform.role_granted', 'user', userId, { roleKey }, undefined, tx);
    });
    return this.listPlatformRoles();
  }

  async revokePlatformRole(actorId: string, userId: string, roleKey: string) {
    if (userId === actorId) throw new AppError('SELF_ACTION_FORBIDDEN');
    const role = await this.prisma.role.findUnique({ where: { scopeKey_key: { scopeKey: 'platform', key: roleKey } } });
    if (!role) throw new AppError('PLATFORM_ROLE_INVALID');
    const holders = await this.prisma.platformRoleAssignment.count({ where: { roleId: role.id } });
    if (holders <= 1) throw new AppError('LAST_OWNER', { reason: 'last_platform_admin' });
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.platformRoleAssignment.deleteMany({ where: { userId, roleId: role.id } });
      if (result.count === 0) throw new AppError('NOT_FOUND');
      await this.auditAdmin(actorId, 'platform.role_revoked', 'user', userId, { roleKey }, undefined, tx);
    });
    return this.listPlatformRoles();
  }

  // ---------------------------------------------------------------- audit

  async listAudit(q: AdminAuditQuery) {
    const limit = pageSize(q);
    const rows = await this.prisma.auditLog.findMany({
      where: { AND: [cursorWhere(q.cursor, 'desc'), q.organizationId ? { organizationId: q.organizationId } : {}, q.actorUserId ? { actorUserId: q.actorUserId } : {}, q.action ? { action: { startsWith: q.action } } : {}] },
      orderBy: { id: 'desc' }, take: limit + 1,
    });
    const page = toPage(rows, limit);
    const ids = [...new Set(page.data.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const actors = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
    const names = new Map(actors.map((u) => [u.id, u.fullName]));
    return { data: page.data.map((r) => ({ ...r, actorName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null })), meta: page.meta };
  }
}
