import { Inject, Injectable } from '@nestjs/common';
import { scopeAllows, type GrantScope } from '@pt/domain';
import { requestContext } from '../../common/context/request-context.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';

/** Resolves permissions and resource relations for the current organization-scoped request. */
@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
  ) {}

  /** Grants of a role: permission code → scope. */
  async grantsOfRole(roleId: string): Promise<Record<string, GrantScope>> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId },
      select: { grantScope: true, permission: { select: { code: true } } },
    });
    return Object.fromEntries(rows.map((r) => [r.permission.code, r.grantScope as GrantScope]));
  }

  /** The caller's grant for a permission in the current organization, if any. */
  grantFor(code: string): GrantScope | undefined {
    return requestContext.tenant().grants[code];
  }

  /** Membership ids of participants actively assigned to the caller. */
  async assignedParticipantIds(): Promise<string[]> {
    const { membershipId } = requestContext.tenant();
    const rows = await this.tenant.db.memberAssignment.findMany({
      where: { practitionerMembershipId: membershipId, endedAt: null },
      select: { participantMembershipId: true },
    });
    return rows.map((r) => r.participantMembershipId);
  }

  /**
   * Prisma filter for lists of memberships the caller may see under `member.read`.
   * Applied inside the query: results are never filtered after fetching.
   */
  async memberReadFilter(code = 'member.read'): Promise<{ id?: { in: string[] } } | Record<string, never>> {
    const { membershipId } = requestContext.tenant();
    switch (this.grantFor(code)) {
      case 'ORG':
      case 'ALL':
        return {};
      case 'ASSIGNED':
        return { id: { in: [membershipId, ...(await this.assignedParticipantIds())] } };
      case 'OWN':
        return { id: { in: [membershipId] } };
      default:
        return { id: { in: [] } };
    }
  }

  /** May the caller use `code` on a resource about member `subjectMembershipId` / created by `ownerMembershipId`? */
  async allows(code: string, rel: { ownerMembershipId?: string; subjectMembershipId?: string }): Promise<boolean> {
    const { membershipId } = requestContext.tenant();
    const grant = this.grantFor(code);
    if (!grant) return false;
    const isOwn = rel.ownerMembershipId === membershipId || rel.subjectMembershipId === membershipId;
    const needsAssignedLookup = grant === 'ASSIGNED' && rel.subjectMembershipId && !isOwn;
    const isAssigned = needsAssignedLookup ? (await this.assignedParticipantIds()).includes(rel.subjectMembershipId!) : false;
    return scopeAllows(grant, { isOwn, isAssigned });
  }
}
