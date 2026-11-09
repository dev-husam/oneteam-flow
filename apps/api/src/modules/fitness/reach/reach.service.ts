import { Inject, Injectable } from '@nestjs/common';
import { scopeAllows } from '@pt/domain';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { AuthorizationService } from '../../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';

/** Who a staff member may act on: shared by workout and nutrition assignments. */
@Injectable()
export class ReachService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
  ) {}

  /**
   * Clients to act on under `code`: named people must all be active and within reach (otherwise 404 for the whole
   * request); members of named groups that are out of reach are skipped and counted.
   */
  async resolveClients(code: string, input: { clientMembershipIds?: string[]; groupIds?: string[] }): Promise<{ ids: string[]; skipped: number }> {
    const t = requestContext.tenant();
    const picked = new Set<string>();
    for (const id of new Set(input.clientMembershipIds ?? [])) {
      const m = await this.tenant.db.membership.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
      if (!m || !(await this.authz.allows(code, { subjectMembershipId: id }))) throw new AppError('NOT_FOUND');
      picked.add(id);
    }
    let skipped = 0;
    if (input.groupIds?.length) {
      const groups = await this.tenant.db.group.findMany({
        where: { id: { in: [...new Set(input.groupIds)] }, archivedAt: null },
        include: { members: { where: { membership: { status: 'ACTIVE' } }, select: { membershipId: true } } },
      });
      if (groups.length !== new Set(input.groupIds).size) throw new AppError('NOT_FOUND');
      for (const g of groups) {
        if (!scopeAllows(t.grants['group.read'], { isOwn: g.createdByMembershipId === t.membershipId, isAssigned: false })) throw new AppError('NOT_FOUND');
        for (const m of g.members) {
          if (picked.has(m.membershipId)) continue;
          if (await this.authz.allows(code, { subjectMembershipId: m.membershipId })) picked.add(m.membershipId);
          else skipped += 1;
        }
      }
    }
    if (picked.size === 0) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'clientMembershipIds', rules: ['arrayNotEmpty'] }] });
    return { ids: [...picked], skipped };
  }
}
