import { Inject, Injectable } from '@nestjs/common';
import { canAssignRank, canManageRank, escalationViolations, isRetiredRole, roleLabelKey, SENSITIVE_PERMISSIONS, slugify, type GrantRequest, type GrantScope } from '@pt/domain';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthorizationService } from '../rbac/authorization.service.js';
import { FeaturesService } from '../rbac/features.service.js';
import type { CreateRoleDto, UpdateRoleDto } from './roles.dto.js';

export interface VisibleRole {
  id: string;
  organizationId: string | null;
  key: string;
  name: string;
  rank: number;
  isSystem: boolean;
}

/** Roles are a MIXED model (system templates + organization roles): every query filters explicitly by organization. */
@Injectable()
export class RolesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FeaturesService) private readonly features: FeaturesService,
  ) {}

  private requireCustomRoles(): Promise<void> {
    return this.features.require('custom_roles', requestContext.tenant().orgId);
  }

  private visibleWhere(orgId: string) {
    return { scopeType: 'ORGANIZATION' as const, OR: [{ organizationId: orgId }, { organizationId: null }] };
  }

  /** A role the current organization can see: a system template or one of its own custom roles. */
  async findVisible(roleId: string): Promise<VisibleRole | null> {
    const { orgId } = requestContext.tenant();
    return this.prisma.role.findFirst({
      where: { id: roleId, ...this.visibleWhere(orgId) },
      select: { id: true, organizationId: true, key: true, name: true, rank: true, isSystem: true },
    });
  }

  /**
   * Resolves a role the caller is allowed to hand out (members, invitations): visible, ranked below the caller
   * (owners may hand out owner) and containing no grant the caller lacks.
   */
  async requireAssignable(roleId: string): Promise<VisibleRole> {
    const role = await this.findVisible(roleId);
    if (!role) throw new AppError('ROLE_INVALID');
    // Owner, trainer and client are the only roles handed out: retired system roles and (while switched off) custom roles are refused.
    if (role.isSystem && isRetiredRole(role.key)) throw new AppError('ROLE_INVALID', { reason: 'retired' });
    if (!role.isSystem && !(await this.features.isEnabled('custom_roles', requestContext.tenant().orgId))) throw new AppError('ROLE_INVALID', { reason: 'custom_roles_disabled' });
    const t = requestContext.tenant();
    if (!canAssignRank(t.roleRank, role.rank)) throw new AppError('PRIVILEGE_ESCALATION', { reason: 'rank' });
    // A system role (trainer, client…) is predefined by the platform: its sensitive permissions are not the actor's to hand out or withhold.
    const violations = escalationViolations(t.grants, await this.grantRequests(role.id), { ignore: role.isSystem ? SENSITIVE_PERMISSIONS : [] });
    if (violations.length) throw new AppError('PRIVILEGE_ESCALATION', { permissions: violations });
    return role;
  }

  private async grantRequests(roleId: string): Promise<GrantRequest[]> {
    const grants = await this.authz.grantsOfRole(roleId);
    return Object.entries(grants).map(([code, scope]) => ({ code, scope }));
  }

  async list() {
    const { orgId, roleRank, grants } = requestContext.tenant();
    const found = await this.prisma.role.findMany({
      where: this.visibleWhere(orgId),
      orderBy: [{ rank: 'desc' }, { key: 'asc' }],
      include: { permissions: { include: { permission: { select: { code: true } } } } },
    });
    const customRoles = await this.features.isEnabled('custom_roles', orgId);
    const roles = found.filter((r) => !(r.isSystem && isRetiredRole(r.key)));
    const counts = await this.prisma.membership.groupBy({ by: ['roleId'], where: { organizationId: orgId, status: { not: 'REMOVED' } }, _count: { _all: true } });
    const countById = new Map(counts.map((c) => [c.roleId, c._count._all]));
    return roles.map((r) => {
      const roleGrants = r.permissions.map((p) => ({ code: p.permission.code, scope: p.grantScope as GrantScope }));
      return {
        id: r.id, key: r.key, name: r.name, rank: r.rank, isSystem: r.isSystem, memberCount: countById.get(r.id) ?? 0,
        grants: roleGrants,
        assignable: (r.isSystem || customRoles) && canAssignRank(roleRank, r.rank) && escalationViolations(grants, roleGrants, { ignore: r.isSystem ? SENSITIVE_PERMISSIONS : [] }).length === 0,
      };
    });
  }

  /**
   * Roles the caller may hand out right now (rank below theirs, no permission they lack). Needed by clients to
   * offer a role choice to members who cannot read the full role list, e.g. a trainer inviting clients.
   */
  async listAssignable() {
    const { orgId } = requestContext.tenant();
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { category: { select: { key: true } } } });
    const roles = (await this.list()).filter((r) => r.assignable);
    return roles.map((r) => ({ id: r.id, key: r.key, name: r.name, rank: r.rank, isSystem: r.isSystem, labelKey: r.isSystem ? roleLabelKey(r.key, org.category.key) : null }));
  }

  async listPermissions() {
    const rows = await this.prisma.permission.findMany({ where: { scopeType: 'ORGANIZATION' }, orderBy: [{ groupKey: 'asc' }, { code: 'asc' }] });
    return rows.map((p) => ({ code: p.code, group: p.groupKey, moduleKey: p.moduleKey, description: p.description, allowedScopes: p.allowedScopes as GrantScope[] }));
  }

  /** Validates requested grants: known ORGANIZATION permissions, legal scope, no escalation. Returns permission ids. */
  private async validateGrants(requested: GrantRequest[]): Promise<{ permissionId: string; grantScope: GrantScope }[]> {
    const codes = [...new Set(requested.map((g) => g.code))];
    if (codes.length !== requested.length) throw new AppError('ROLE_INVALID', { reason: 'duplicate_permission' });
    const defs = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    const byCode = new Map(defs.map((d) => [d.code, d]));
    for (const g of requested) {
      const def = byCode.get(g.code);
      // Platform permissions can never be part of an organization role.
      if (!def || def.scopeType !== 'ORGANIZATION') throw new AppError('ROLE_INVALID', { reason: 'unknown_permission', code: g.code });
      if (!(def.allowedScopes as GrantScope[]).includes(g.scope)) {
        throw new AppError('ROLE_INVALID', { reason: 'scope_not_allowed', code: g.code, scope: g.scope });
      }
    }
    const violations = escalationViolations(requestContext.tenant().grants, requested);
    if (violations.length) throw new AppError('PRIVILEGE_ESCALATION', { permissions: violations });
    return requested.map((g) => ({ permissionId: byCode.get(g.code)!.id, grantScope: g.scope }));
  }

  async create(dto: CreateRoleDto) {
    await this.requireCustomRoles();
    const t = requestContext.tenant();
    if (!canAssignRank(t.roleRank, dto.rank) || dto.rank >= t.roleRank) throw new AppError('PRIVILEGE_ESCALATION', { reason: 'rank' });

    let requested: GrantRequest[] = dto.grants ?? [];
    if (!dto.grants) {
      if (!dto.templateRoleId) throw new AppError('ROLE_INVALID', { reason: 'grants_or_template_required' });
      const template = await this.findVisible(dto.templateRoleId);
      if (!template) throw new AppError('ROLE_INVALID');
      requested = await this.grantRequests(template.id);
    }
    const rows = await this.validateGrants(requested);
    const key = await this.uniqueKey(t.orgId, dto.name);

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          organizationId: t.orgId, scopeKey: t.orgId, key, name: dto.name, scopeType: 'ORGANIZATION', rank: dto.rank,
          isSystem: false, templateRoleId: dto.templateRoleId,
          permissions: { create: rows },
        },
      });
      await this.audit.record({ action: 'role.created', targetType: 'role', targetId: created.id, metadata: { name: dto.name, rank: dto.rank, grants: requested } }, tx);
      return created;
    });
    return this.getOne(role.id);
  }

  private async uniqueKey(orgId: string, name: string): Promise<string> {
    const base = `custom-${slugify(name) || 'role'}`.slice(0, 50);
    for (let i = 0; i < 20; i++) {
      const key = i === 0 ? base : `${base}-${i + 1}`;
      const exists = await this.prisma.role.findUnique({ where: { scopeKey_key: { scopeKey: orgId, key } }, select: { id: true } });
      if (!exists) return key;
    }
    throw new AppError('CONFLICT');
  }

  private async getOne(roleId: string) {
    const all = await this.list();
    return all.find((r) => r.id === roleId)!;
  }

  /** Custom role of THIS organization that the caller outranks. System templates are immutable. */
  private async requireEditable(roleId: string) {
    const role = await this.findVisible(roleId);
    if (!role) throw new AppError('NOT_FOUND');
    if (role.isSystem) throw new AppError('ROLE_IMMUTABLE');
    if (!canManageRank(requestContext.tenant().roleRank, role.rank)) throw new AppError('PRIVILEGE_ESCALATION', { reason: 'rank' });
    return role;
  }

  async update(roleId: string, dto: UpdateRoleDto) {
    await this.requireCustomRoles();
    const t = requestContext.tenant();
    const role = await this.requireEditable(roleId);
    if (dto.rank !== undefined && dto.rank >= t.roleRank) throw new AppError('PRIVILEGE_ESCALATION', { reason: 'rank' });
    const rows = dto.grants ? await this.validateGrants(dto.grants) : undefined;
    const before = rows ? await this.grantRequests(roleId) : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({ where: { id: role.id }, data: { name: dto.name, rank: dto.rank } });
      if (rows) {
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.rolePermission.createMany({ data: rows.map((r) => ({ roleId: role.id, ...r })) });
      }
      await this.audit.record({ action: 'role.updated', targetType: 'role', targetId: role.id, metadata: { name: dto.name, rank: dto.rank, before, after: dto.grants } }, tx);
    });
    return this.getOne(role.id);
  }

  async remove(roleId: string): Promise<void> {
    await this.requireCustomRoles();
    const t = requestContext.tenant();
    const role = await this.requireEditable(roleId);
    const used = (await this.prisma.membership.count({ where: { organizationId: t.orgId, roleId: role.id } })) +
      (await this.prisma.invitation.count({ where: { organizationId: t.orgId, roleId: role.id } })); // history keeps referencing the role
    if (used > 0) throw new AppError('ROLE_IN_USE');
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id: role.id } });
      await this.audit.record({ action: 'role.deleted', targetType: 'role', targetId: role.id, metadata: { name: role.name } }, tx);
    });
  }
}
