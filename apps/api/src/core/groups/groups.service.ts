import { Inject, Injectable } from '@nestjs/common';
import { scopeAllows } from '@pt/domain';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage } from '../../common/pagination.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthorizationService } from '../rbac/authorization.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import type { AddGroupMemberDto, CreateGroupDto, ListGroupsQuery, UpdateGroupDto } from './groups.dto.js';

const groupSelect = {
  id: true, name: true, description: true, typeKey: true, createdByMembershipId: true, archivedAt: true, createdAt: true,
  _count: { select: { members: true } },
} as const;

type GroupRow = { id: string; name: string; description: string | null; typeKey: string | null; createdByMembershipId: string; archivedAt: Date | null; createdAt: Date; _count: { members: number } };

@Injectable()
export class GroupsService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private toDto(g: GroupRow) {
    return { id: g.id, name: g.name, description: g.description, typeKey: g.typeKey, createdByMembershipId: g.createdByMembershipId, archived: g.archivedAt !== null, memberCount: g._count.members, createdAt: g.createdAt };
  }

  private readFilter() {
    const t = requestContext.tenant();
    return t.grants['group.read'] === 'OWN' ? { createdByMembershipId: t.membershipId } : {};
  }

  async list(q: ListGroupsQuery) {
    const limit = pageSize(q);
    const rows = await this.tenant.db.group.findMany({
      where: { AND: [this.readFilter(), cursorWhere(q.cursor, 'asc'), { archivedAt: null }] },
      orderBy: { id: 'asc' }, take: limit + 1, select: groupSelect,
    });
    const page = toPage(rows, limit);
    return { data: page.data.map((g) => this.toDto(g)), meta: page.meta };
  }

  async create(dto: CreateGroupDto) {
    const t = requestContext.tenant();
    const group = await this.tenant.db.group.create({ data: { ...dto, organizationId: t.orgId, createdByMembershipId: t.membershipId }, select: groupSelect });
    await this.audit.record({ action: 'group.created', targetType: 'group', targetId: group.id });
    return this.toDto(group);
  }

  private async requireReadable(groupId: string) {
    const g = await this.tenant.db.group.findFirst({ where: { id: groupId, ...this.readFilter() }, select: groupSelect });
    if (!g) throw new AppError('NOT_FOUND');
    return g;
  }

  /** Visible (group.read) AND manageable (group.manage scope). Invisible groups are 404, visible-but-not-yours 403. */
  private async requireManageable(groupId: string) {
    const g = await this.requireReadable(groupId);
    const t = requestContext.tenant();
    if (g.archivedAt) throw new AppError('NOT_FOUND');
    if (!scopeAllows(t.grants['group.manage'], { isOwn: g.createdByMembershipId === t.membershipId, isAssigned: false })) throw new AppError('FORBIDDEN');
    return g;
  }

  async get(groupId: string) {
    const g = await this.requireReadable(groupId);
    const members = await this.tenant.db.groupMember.findMany({
      where: { groupId }, orderBy: { addedAt: 'asc' },
      include: { membership: { include: { user: { select: { fullName: true } }, role: { select: { key: true } } } } },
    });
    return { ...this.toDto(g), members: members.map((m) => ({ membershipId: m.membershipId, fullName: m.membership.user.fullName, roleKey: m.membership.role.key, addedAt: m.addedAt })) };
  }

  async update(groupId: string, dto: UpdateGroupDto) {
    await this.requireManageable(groupId);
    const g = await this.tenant.db.group.update({ where: { id: groupId }, data: dto, select: groupSelect });
    await this.audit.record({ action: 'group.updated', targetType: 'group', targetId: groupId });
    return this.toDto(g);
  }

  async archive(groupId: string): Promise<void> {
    await this.requireManageable(groupId);
    await this.tenant.db.group.update({ where: { id: groupId }, data: { archivedAt: new Date() } });
    await this.audit.record({ action: 'group.archived', targetType: 'group', targetId: groupId });
  }

  async addMember(groupId: string, dto: AddGroupMemberDto) {
    await this.requireManageable(groupId);
    const target = await this.tenant.db.membership.findFirst({ where: { id: dto.membershipId, status: 'ACTIVE' }, select: { id: true } });
    // The caller may only add people they are allowed to see.
    if (!target || !(await this.authz.allows('member.read', { subjectMembershipId: target.id }))) throw new AppError('GROUP_MEMBER_INVALID');
    const exists = await this.tenant.db.groupMember.findFirst({ where: { groupId, membershipId: target.id } });
    if (!exists) {
      await this.tenant.db.groupMember.create({ data: { groupId, membershipId: target.id, organizationId: requestContext.tenant().orgId } });
      await this.audit.record({ action: 'group.member_added', targetType: 'group', targetId: groupId, metadata: { membershipId: target.id } });
    }
    return this.get(groupId);
  }

  async removeMember(groupId: string, membershipId: string): Promise<void> {
    await this.requireManageable(groupId);
    const result = await this.tenant.db.groupMember.deleteMany({ where: { groupId, membershipId } });
    if (result.count === 0) throw new AppError('NOT_FOUND');
    await this.audit.record({ action: 'group.member_removed', targetType: 'group', targetId: groupId, metadata: { membershipId } });
  }
}
