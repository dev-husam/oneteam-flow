import { Inject, Injectable } from '@nestjs/common';
import { requestContext } from '../../common/context/request-context.js';
import { cursorWhere, pageSize, toPage, type PageQueryDto } from '../../common/pagination.js';
import { AuthorizationService } from '../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../core/tenancy/tenant-prisma.service.js';

export interface ActivityInput {
  entityType: string;
  entityId: string;
  verb: string;
  subjectMembershipId?: string;
  data?: Record<string, unknown>;
}

/** User-visible history of what happened to which record (task history, progress feed). */
@Injectable()
export class ActivityService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
  ) {}

  /** Pass the transaction client so the event is committed (or rolled back) together with the change. */
  async record(input: ActivityInput, tx?: Pick<TenantPrismaService['db'], 'activityEvent'>): Promise<void> {
    const t = requestContext.tenant();
    await (tx ?? this.tenant.db).activityEvent.create({
      data: {
        organizationId: t.orgId,
        actorMembershipId: t.membershipId,
        entityType: input.entityType,
        entityId: input.entityId,
        verb: input.verb,
        subjectMembershipId: input.subjectMembershipId,
        data: input.data as never,
      },
    });
  }

  async forEntity(entityType: string, entityId: string) {
    const rows = await this.tenant.db.activityEvent.findMany({
      where: { entityType, entityId },
      orderBy: { id: 'asc' },
      include: { actor: { include: { user: { select: { fullName: true } } } } },
    });
    return rows.map((e) => ({ id: e.id, verb: e.verb, actorMembershipId: e.actorMembershipId, actorName: e.actor?.user.fullName ?? null, data: e.data, createdAt: e.createdAt }));
  }

  /** Feed scoped by `activity.read`: own events, assigned people's events, or everything. */
  async feed(q: PageQueryDto) {
    const t = requestContext.tenant();
    const limit = pageSize(q);
    let scope: object = { id: { in: [] } };
    switch (this.authz.grantFor('activity.read')) {
      case 'ORG':
      case 'ALL':
        scope = {};
        break;
      case 'ASSIGNED': {
        const people = [t.membershipId, ...(await this.authz.assignedParticipantIds())];
        scope = { OR: [{ actorMembershipId: t.membershipId }, { subjectMembershipId: { in: people } }] };
        break;
      }
      case 'OWN':
        scope = { OR: [{ actorMembershipId: t.membershipId }, { subjectMembershipId: t.membershipId }] };
        break;
    }
    const rows = await this.tenant.db.activityEvent.findMany({
      where: { AND: [scope, cursorWhere(q.cursor, 'desc')] },
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: { actor: { include: { user: { select: { fullName: true } } } } },
    });
    const page = toPage(rows, limit);
    return {
      data: page.data.map((e) => ({ id: e.id, verb: e.verb, entityType: e.entityType, entityId: e.entityId, actorName: e.actor?.user.fullName ?? null, subjectMembershipId: e.subjectMembershipId, data: e.data, createdAt: e.createdAt })),
      meta: page.meta,
    };
  }
}
