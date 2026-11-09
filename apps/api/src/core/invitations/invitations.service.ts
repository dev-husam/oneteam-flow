import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { roleLabelKey, scopeAllows } from '@pt/domain';
import type { Queue } from 'bullmq';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { randomToken, sha256Hex } from '../../common/util/crypto.js';
import { cursorWhere, pageSize, toPage } from '../../common/pagination.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { EMAIL_JOB_OPTIONS, QUEUES, type EmailJob } from '../../infra/queue/queues.js';
import { AuditService } from '../audit/audit.service.js';
import { isSingleOrganizationViolation } from '../organizations/organizations.service.js';
import { AuthorizationService } from '../rbac/authorization.service.js';
import { RolesService } from '../roles/roles.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import type { CreateInvitationDto, ListInvitationsQuery } from './invitations.dto.js';

const INVITATION_TTL_MS = 7 * 86_400_000;

interface InvitationPayload {
  fullName?: string;
  assignToMembershipId?: string;
  groupIds?: string[];
}

const invitationSelect = {
  id: true, email: true, phone: true, status: true, expiresAt: true, createdAt: true, acceptedAt: true, payload: true,
  roleId: true, invitedByMembershipId: true,
} as const;

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @InjectQueue(QUEUES.EMAIL) private readonly queue: Queue<EmailJob>,
  ) {}

  private toDto(i: { id: string; email: string; phone: string | null; status: string; expiresAt: Date; createdAt: Date; acceptedAt: Date | null; roleId: string; invitedByMembershipId: string }) {
    const expired = i.status === 'PENDING' && i.expiresAt.getTime() <= Date.now();
    return { id: i.id, email: i.email, phone: i.phone, status: expired ? 'EXPIRED' : i.status, roleId: i.roleId, invitedByMembershipId: i.invitedByMembershipId, expiresAt: i.expiresAt, createdAt: i.createdAt, acceptedAt: i.acceptedAt };
  }

  // ------------------------------------------------------------------ organization side

  async create(dto: CreateInvitationDto) {
    const t = requestContext.tenant();
    const role = await this.roles.requireAssignable(dto.roleId);

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (existingUser) {
      const member = await this.tenant.db.membership.findFirst({ where: { userId: existingUser.id, status: { not: 'REMOVED' } }, select: { id: true } });
      if (member) throw new AppError('ALREADY_MEMBER');
    }
    const pending = await this.tenant.db.invitation.findFirst({ where: { email: dto.email, status: 'PENDING', expiresAt: { gt: new Date() } }, select: { id: true } });
    if (pending) throw new AppError('INVITATION_PENDING');

    const payload: InvitationPayload = { fullName: dto.fullName };
    payload.assignToMembershipId = await this.resolveAssignee(dto.assignToMembershipId, role.rank);
    payload.groupIds = dto.groupIds?.length ? await this.resolveGroups(dto.groupIds) : undefined;

    const token = randomToken();
    const invitation = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.invitation.create({
        data: {
          organizationId: t.orgId, email: dto.email, phone: dto.phone, roleId: role.id, invitedByMembershipId: t.membershipId, tokenHash: sha256Hex(token),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS), payload: payload as never,
        },
        select: invitationSelect,
      });
      await this.audit.record({ action: 'invitation.created', targetType: 'invitation', targetId: created.id, metadata: { roleKey: role.key, roleId: role.id } }, tx);
      return created;
    });
    await this.queue.add('invitation', { template: 'invitation', invitationId: invitation.id, token }, EMAIL_JOB_OPTIONS);
    return this.toDto(invitation);
  }

  /** Who the new member will be assigned to: explicit choice (needs assignment.manage) or the caller when their reach is "assigned only". */
  private async resolveAssignee(requested: string | undefined, invitedRank: number): Promise<string | undefined> {
    const t = requestContext.tenant();
    const implicit = !requested && t.grants['member.read'] === 'ASSIGNED' && invitedRank < t.roleRank;
    const assigneeId = requested ?? (implicit ? t.membershipId : undefined);
    if (!assigneeId) return undefined;
    if (assigneeId !== t.membershipId && !('assignment.manage' in t.grants)) throw new AppError('FORBIDDEN');
    const assignee = await this.tenant.db.membership.findFirst({ where: { id: assigneeId, status: 'ACTIVE' }, include: { role: { select: { rank: true } } } });
    if (!assignee || assignee.role.rank <= invitedRank) throw new AppError('ASSIGNMENT_INVALID');
    return assignee.id;
  }

  private async resolveGroups(groupIds: string[]): Promise<string[]> {
    const t = requestContext.tenant();
    const unique = [...new Set(groupIds)];
    const groups = await this.tenant.db.group.findMany({ where: { id: { in: unique }, archivedAt: null }, select: { id: true, createdByMembershipId: true } });
    if (groups.length !== unique.length) throw new AppError('NOT_FOUND');
    const allowed = groups.every((g) => scopeAllows(t.grants['group.manage'], { isOwn: g.createdByMembershipId === t.membershipId, isAssigned: false }));
    if (!allowed) throw new AppError('FORBIDDEN');
    return unique;
  }

  async list(q: ListInvitationsQuery) {
    const t = requestContext.tenant();
    const limit = pageSize(q);
    const scoped = t.grants['invitation.read'] === 'OWN' ? { invitedByMembershipId: t.membershipId } : {};
    const rows = await this.tenant.db.invitation.findMany({
      where: { AND: [scoped, cursorWhere(q.cursor, 'asc'), q.status ? { status: q.status } : {}] },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: invitationSelect,
    });
    const page = toPage(rows, limit);
    return { data: page.data.map((i) => this.toDto(i)), meta: page.meta };
  }

  /** Invitation the caller may manage under `invitation.manage`; otherwise 404. */
  private async requireManageable(id: string) {
    const inv = await this.tenant.db.invitation.findFirst({ where: { id }, select: { ...invitationSelect, roleId: true } });
    if (!inv || !(await this.authz.allows('invitation.manage', { ownerMembershipId: inv.invitedByMembershipId }))) throw new AppError('NOT_FOUND');
    return inv;
  }

  async resend(id: string) {
    const inv = await this.requireManageable(id);
    if (inv.status !== 'PENDING' && !(inv.status === 'EXPIRED')) throw new AppError('INVITATION_INVALID');
    await this.roles.requireAssignable(inv.roleId); // the caller must still be allowed to hand out this role
    const token = randomToken();
    const updated = await this.tenant.db.invitation.update({
      where: { id },
      data: { tokenHash: sha256Hex(token), status: 'PENDING', expiresAt: new Date(Date.now() + INVITATION_TTL_MS) },
      select: invitationSelect,
    });
    await this.audit.record({ action: 'invitation.resent', targetType: 'invitation', targetId: id });
    await this.queue.add('invitation', { template: 'invitation', invitationId: id, token }, EMAIL_JOB_OPTIONS);
    return this.toDto(updated);
  }

  async revoke(id: string): Promise<void> {
    const inv = await this.requireManageable(id);
    if (inv.status !== 'PENDING') throw new AppError('INVITATION_INVALID');
    await this.tenant.db.invitation.update({ where: { id }, data: { status: 'REVOKED' } });
    await this.audit.record({ action: 'invitation.revoked', targetType: 'invitation', targetId: id });
  }

  // ------------------------------------------------------------------ invitee side (no tenant context yet)

  private async findUsable(token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: {
        organization: { select: { id: true, name: true, slug: true, status: true, category: { select: { key: true } } } },
        role: { select: { id: true, key: true, name: true } },
        invitedBy: { include: { user: { select: { fullName: true } } } },
      },
    });
    if (!inv || inv.status !== 'PENDING' || inv.expiresAt.getTime() <= Date.now()) throw new AppError('INVITATION_INVALID');
    return inv;
  }

  async preview(token: string) {
    const inv = await this.findUsable(token);
    const payload = (inv.payload ?? {}) as InvitationPayload;
    return {
      email: inv.email,
      fullName: payload.fullName ?? null,
      organization: { name: inv.organization.name, slug: inv.organization.slug },
      role: { name: inv.role.name, labelKey: roleLabelKey(inv.role.key, inv.organization.category.key) },
      invitedBy: inv.invitedBy.user.fullName,
      expiresAt: inv.expiresAt,
    };
  }

  /** Accepting requires a verified account whose e-mail equals the invited address. */
  async accept(token: string, user: { userId: string; emailVerified: boolean }) {
    if (!user.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED');
    const inv = await this.findUsable(token);
    const account = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: { email: true } });
    if (account.email.toLowerCase() !== inv.email.toLowerCase()) throw new AppError('INVITATION_EMAIL_MISMATCH');
    if (inv.organization.status !== 'ACTIVE') throw new AppError('ORGANIZATION_SUSPENDED');
    const payload = (inv.payload ?? {}) as InvitationPayload;
    const orgId = inv.organizationId;

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, organizationId: orgId, status: 'PENDING' },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedByUserId: user.userId },
      });
      if (claimed.count !== 1) throw new AppError('INVITATION_INVALID');

      const existing = await tx.membership.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId: user.userId } } });
      if (existing && existing.status !== 'REMOVED') throw new AppError('ALREADY_MEMBER');
      // One organization per account: belonging to another one means this invitation cannot be accepted.
      if (await tx.membership.findFirst({ where: { userId: user.userId, status: { not: 'REMOVED' } }, select: { id: true } })) {
        throw new AppError('ALREADY_IN_ORGANIZATION');
      }
      const membership = existing
        ? await tx.membership.update({ where: { id: existing.id }, data: { status: 'ACTIVE', roleId: inv.roleId, removedAt: null, joinedAt: new Date(), invitationId: inv.id, activeUserKey: user.userId } })
        : await tx.membership.create({ data: { organizationId: orgId, userId: user.userId, roleId: inv.roleId, invitationId: inv.id, activeUserKey: user.userId } });

      // Follow-up actions chosen by the inviter. They are skipped (not failed) if the target no longer qualifies.
      if (payload.assignToMembershipId) {
        const assignee = await tx.membership.findFirst({ where: { id: payload.assignToMembershipId, organizationId: orgId, status: 'ACTIVE' }, select: { id: true } });
        if (assignee) {
          await tx.memberAssignment.create({
            data: {
              organizationId: orgId, practitionerMembershipId: assignee.id, participantMembershipId: membership.id, kind: 'PRIMARY',
              activeKey: `P:${membership.id}`, createdByMembershipId: inv.invitedByMembershipId,
            },
          });
        }
      }
      if (payload.groupIds?.length) {
        const groups = await tx.group.findMany({ where: { id: { in: payload.groupIds }, organizationId: orgId, archivedAt: null }, select: { id: true } });
        if (groups.length) {
          await tx.groupMember.createMany({ data: groups.map((g) => ({ groupId: g.id, membershipId: membership.id, organizationId: orgId })) });
        }
      }
      await this.audit.record(
        { action: 'invitation.accepted', organizationId: orgId, actorUserId: user.userId, targetType: 'membership', targetId: membership.id, metadata: { invitationId: inv.id } },
        tx,
      );
      return { organizationId: orgId, slug: inv.organization.slug, membershipId: membership.id };
    }).catch((err: unknown) => {
      // Two invitations accepted at the same moment: the unique index lets only one membership through.
      if (isSingleOrganizationViolation(err)) throw new AppError('ALREADY_IN_ORGANIZATION');
      throw err;
    });
  }
}
