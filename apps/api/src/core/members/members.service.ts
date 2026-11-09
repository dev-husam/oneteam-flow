import { Inject, Injectable } from '@nestjs/common';
import { canManageRank, roleLabelKey } from '@pt/domain';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage } from '../../common/pagination.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthorizationService } from '../rbac/authorization.service.js';
import { RolesService } from '../roles/roles.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import type { ChangeRoleDto, ListMembersQuery } from './members.dto.js';

const OWNER_KEY = 'owner';
const memberInclude = {
  user: { select: { id: true, fullName: true, email: true } },
  role: { select: { id: true, key: true, name: true, rank: true } },
} as const;

@Injectable()
export class MembersService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async categoryKey(): Promise<string> {
    const org = await this.tenant.db.organization.findFirstOrThrow({ select: { category: { select: { key: true } } } });
    return org.category.key;
  }

  private toDto(m: { id: string; status: string; joinedAt: Date; user: { id: string; fullName: string; email: string }; role: { id: string; key: string; name: string; rank: number } }, category: string) {
    return {
      id: m.id, userId: m.user.id, fullName: m.user.fullName, email: m.user.email, status: m.status, joinedAt: m.joinedAt,
      role: { ...m.role, labelKey: roleLabelKey(m.role.key, category) },
    };
  }

  async list(q: ListMembersQuery) {
    const limit = pageSize(q);
    const visible = await this.authz.memberReadFilter();
    const rows = await this.tenant.db.membership.findMany({
      where: {
        AND: [
          visible,
          cursorWhere(q.cursor, 'asc'),
          // Removed members are hidden unless explicitly requested.
          q.status ? { status: q.status } : { status: { not: 'REMOVED' as const } },
          q.roleId ? { roleId: q.roleId } : {},
          q.q ? { user: { OR: [{ fullName: { contains: q.q } }, { email: { contains: q.q.toLowerCase() } }] } } : {},
        ],
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      include: memberInclude,
    });
    const category = await this.categoryKey();
    const page = toPage(rows, limit);
    return { data: page.data.map((m) => this.toDto(m, category)), meta: page.meta };
  }

  /** 404 (not 403) for members the caller may not see: existence is not revealed. */
  async get(memberId: string) {
    const m = await this.tenant.db.membership.findFirst({ where: { id: memberId }, include: memberInclude });
    if (!m || !(await this.authz.allows('member.read', { subjectMembershipId: m.id }))) throw new AppError('NOT_FOUND');
    return this.toDto(m, await this.categoryKey());
  }

  /** Loads a target the caller may manage by rank; never the caller themself. */
  private async requireManageable(memberId: string) {
    const t = requestContext.tenant();
    const target = await this.tenant.db.membership.findFirst({ where: { id: memberId }, include: { role: { select: { id: true, key: true, rank: true } } } });
    if (!target) throw new AppError('NOT_FOUND');
    if (target.id === t.membershipId) throw new AppError('SELF_ACTION_FORBIDDEN');
    if (!canManageRank(t.roleRank, target.role.rank)) throw new AppError('MEMBER_RANK_TOO_HIGH');
    return target;
  }

  /** An organization must always keep at least one ACTIVE owner. */
  private async assertNotLastOwner(targetMembershipId: string): Promise<void> {
    const owners = await this.tenant.db.membership.findMany({ where: { status: 'ACTIVE', role: { key: OWNER_KEY, organizationId: null } }, select: { id: true } });
    if (owners.length === 1 && owners[0]!.id === targetMembershipId) throw new AppError('LAST_OWNER');
  }

  async changeRole(memberId: string, dto: ChangeRoleDto) {
    const target = await this.requireManageable(memberId);
    const role = await this.roles.requireAssignable(dto.roleId);
    if (target.status === 'REMOVED') throw new AppError('NOT_FOUND');
    if (target.role.key === OWNER_KEY && target.role.id !== role.id) await this.assertNotLastOwner(target.id);

    await this.tenant.db.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: target.id }, data: { roleId: role.id } });
      await this.audit.record({ action: 'member.role_changed', targetType: 'membership', targetId: target.id, metadata: { from: target.role.key, to: role.key, fromRoleId: target.role.id, toRoleId: role.id } }, tx);
    });
    return this.get(memberId);
  }

  async setStatus(memberId: string, status: 'ACTIVE' | 'SUSPENDED') {
    const target = await this.requireManageable(memberId);
    if (target.status === 'REMOVED') throw new AppError('NOT_FOUND');
    if (status === 'SUSPENDED' && target.role.key === OWNER_KEY) await this.assertNotLastOwner(target.id);
    await this.tenant.db.membership.update({ where: { id: target.id }, data: { status } });
    await this.audit.record({ action: status === 'SUSPENDED' ? 'member.suspended' : 'member.reactivated', targetType: 'membership', targetId: target.id });
    return this.get(memberId);
  }

  async remove(memberId: string): Promise<void> {
    const target = await this.requireManageable(memberId);
    await this.removeMembership(target.id, target.role.key, 'member.removed');
  }

  async leave(): Promise<void> {
    const t = requestContext.tenant();
    await this.removeMembership(t.membershipId, t.roleKey, 'member.left');
  }

  private async removeMembership(membershipId: string, roleKey: string, action: string): Promise<void> {
    if (roleKey === OWNER_KEY) await this.assertNotLastOwner(membershipId);
    const now = new Date();
    await this.tenant.db.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: membershipId }, data: { status: 'REMOVED', removedAt: now, activeUserKey: null } });
      await tx.memberAssignment.updateMany({
        where: { endedAt: null, OR: [{ practitionerMembershipId: membershipId }, { participantMembershipId: membershipId }] },
        data: { endedAt: now, activeKey: null },
      });
      await tx.groupMember.deleteMany({ where: { membershipId } });
      await this.audit.record({ action, targetType: 'membership', targetId: membershipId }, tx);
    });
  }
}
