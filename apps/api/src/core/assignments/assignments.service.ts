import { Inject, Injectable } from '@nestjs/common';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage } from '../../common/pagination.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthorizationService } from '../rbac/authorization.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import type { CreateAssignmentDto, ListAssignmentsQuery } from './assignments.dto.js';

const select = {
  id: true, practitionerMembershipId: true, participantMembershipId: true, kind: true, startedAt: true, endedAt: true, createdByMembershipId: true,
  practitioner: { select: { user: { select: { fullName: true } } } },
  participant: { select: { user: { select: { fullName: true } } } },
} as const;

type Row = { practitioner: { user: { fullName: string } }; participant: { user: { fullName: string } } } & Record<string, unknown>;
/** Adds the display names clients need, without exposing the nested relations. */
function present<T extends Row>(row: T) {
  const { practitioner, participant, ...rest } = row;
  return { ...rest, practitionerName: practitioner.user.fullName, participantName: participant.user.fullName };
}

/** practitioner → participant relationship. This is what the `ASSIGNED` permission scope resolves against. */
@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(q: ListAssignmentsQuery) {
    const t = requestContext.tenant();
    const limit = pageSize(q);
    const own = t.grants['assignment.read'] === 'OWN'
      ? { OR: [{ practitionerMembershipId: t.membershipId }, { participantMembershipId: t.membershipId }] }
      : {};
    const rows = await this.tenant.db.memberAssignment.findMany({
      where: {
        AND: [
          own,
          cursorWhere(q.cursor, 'asc'),
          (q.active ?? true) ? { endedAt: null } : { endedAt: { not: null } },
          q.practitionerMembershipId ? { practitionerMembershipId: q.practitionerMembershipId } : {},
          q.participantMembershipId ? { participantMembershipId: q.participantMembershipId } : {},
        ],
      },
      orderBy: { id: 'asc' }, take: limit + 1, select,
    });
    const page = toPage(rows, limit);
    return { data: page.data.map(present), meta: page.meta };
  }

  async create(dto: CreateAssignmentDto) {
    const t = requestContext.tenant();
    if (dto.practitionerMembershipId === dto.participantMembershipId) throw new AppError('ASSIGNMENT_INVALID');
    const members = await this.tenant.db.membership.findMany({
      where: { id: { in: [dto.practitionerMembershipId, dto.participantMembershipId] }, status: 'ACTIVE' },
      include: { role: { select: { rank: true } } },
    });
    const practitioner = members.find((m) => m.id === dto.practitionerMembershipId);
    const participant = members.find((m) => m.id === dto.participantMembershipId);
    // Both must be active members of this organization and the practitioner must outrank the participant.
    if (!practitioner || !participant || practitioner.role.rank <= participant.role.rank) throw new AppError('ASSIGNMENT_INVALID');

    const kind = dto.kind ?? 'PRIMARY';
    const activeKey = kind === 'PRIMARY' ? `P:${participant.id}` : `S:${practitioner.id}:${participant.id}`;
    try {
      const created = await this.tenant.db.$transaction(async (tx) => {
        const row = await tx.memberAssignment.create({
          data: { organizationId: t.orgId, practitionerMembershipId: practitioner.id, participantMembershipId: participant.id, kind, activeKey, createdByMembershipId: t.membershipId },
          select,
        });
        await this.audit.record({ action: 'assignment.created', targetType: 'assignment', targetId: row.id, metadata: { practitionerMembershipId: practitioner.id, participantMembershipId: participant.id, kind } }, tx);
        return row;
      });
      return present(created);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw new AppError('ASSIGNMENT_EXISTS');
      throw err;
    }
  }

  async end(id: string) {
    const existing = await this.tenant.db.memberAssignment.findFirst({ where: { id, endedAt: null }, select: { id: true } });
    if (!existing) throw new AppError('NOT_FOUND');
    const row = await this.tenant.db.memberAssignment.update({ where: { id }, data: { endedAt: new Date(), activeKey: null }, select });
    await this.audit.record({ action: 'assignment.ended', targetType: 'assignment', targetId: id });
    return present(row);
  }
}
