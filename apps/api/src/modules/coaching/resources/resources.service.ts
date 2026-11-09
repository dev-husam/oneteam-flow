import { Inject, Injectable } from '@nestjs/common';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { FilesService } from '../../../capabilities/files/files.service.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { AuthorizationService } from '../../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { CoachingReach, userName } from '../reach.service.js';
import type { CreateResourceDto } from './resources.dto.js';

const include = { creator: { select: userName }, file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } } as const;

@Injectable()
export class ResourcesService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CoachingReach) private readonly reach: CoachingReach,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}

  private toDto(r: { id: string; title: string; description: string | null; url: string | null; clientMembershipId: string | null; createdByMembershipId: string; createdAt: Date; creator: { user: { fullName: string } }; file: { id: string; originalName: string; mimeType: string; sizeBytes: bigint } | null }) {
    return {
      id: r.id, title: r.title, description: r.description, url: r.url, clientMembershipId: r.clientMembershipId, sharedWithAll: r.clientMembershipId === null,
      createdByMembershipId: r.createdByMembershipId, createdByName: r.creator.user.fullName, createdAt: r.createdAt,
      file: r.file ? { fileId: r.file.id, fileName: r.file.originalName, mimeType: r.file.mimeType, sizeBytes: Number(r.file.sizeBytes) } : null,
    };
  }

  /**
   * Who sees a resource: its coach; people with organization-wide reach; a client named on it; and, for a resource
   * shared with "all my clients", every client currently assigned to its coach.
   */
  async canSee(resource: { createdByMembershipId: string; clientMembershipId: string | null }): Promise<boolean> {
    const t = requestContext.tenant();
    if (resource.createdByMembershipId === t.membershipId) return true;
    if (this.authz.grantFor('coaching.resource.read') === 'ORG') return true;
    if (resource.clientMembershipId) return this.authz.allows('coaching.resource.read', { subjectMembershipId: resource.clientMembershipId });
    // Shared with all of the coach’s clients: visible to a client assigned to that coach, or to a coach looking after one of them.
    const assigned = await this.tenant.db.memberAssignment.findFirst({ where: { practitionerMembershipId: resource.createdByMembershipId, participantMembershipId: t.membershipId, endedAt: null }, select: { id: true } });
    return assigned !== null;
  }

  async list(clientMembershipId?: string) {
    const t = requestContext.tenant();
    const grant = this.authz.grantFor('coaching.resource.read');
    let where;
    if (grant === 'OWN') {
      const coaches = await this.reach.coachesOf(t.membershipId);
      where = { archivedAt: null, OR: [{ clientMembershipId: t.membershipId }, { clientMembershipId: null, createdByMembershipId: { in: coaches } }] };
    } else if (grant === 'ASSIGNED') {
      where = { archivedAt: null, createdByMembershipId: t.membershipId, ...(clientMembershipId ? { OR: [{ clientMembershipId }, { clientMembershipId: null }] } : {}) };
    } else if (grant === 'ORG') {
      where = { archivedAt: null, ...(clientMembershipId ? { OR: [{ clientMembershipId }, { clientMembershipId: null }] } : {}) };
    } else {
      return [];
    }
    const rows = await this.tenant.db.coachResource.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include });
    return rows.map((r) => this.toDto(r));
  }

  async create(dto: CreateResourceDto) {
    const t = requestContext.tenant();
    if (!dto.url && !dto.fileId) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'url', rules: ['linkOrFileRequired'] }] });
    const client = dto.clientMembershipId ? await this.reach.requireClient('coaching.resource.manage', dto.clientMembershipId) : null;
    if (dto.fileId) {
      // Only your own finished, non-sensitive upload, used once (access to the file then follows the resource).
      const ok = await this.tenant.db.file.count({ where: { id: dto.fileId, uploaderMembershipId: t.membershipId, status: 'READY', deletedAt: null, sensitivity: 'STANDARD' } });
      if (ok !== 1) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'fileId', rules: ['unknownFile'] }] });
      if (await this.tenant.db.coachResource.findFirst({ where: { fileId: dto.fileId }, select: { id: true } })) throw new AppError('CONFLICT', { reason: 'file_in_use' });
    }
    const row = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.coachResource.create({
        data: { organizationId: t.orgId, createdByMembershipId: t.membershipId, clientMembershipId: client?.id ?? null, title: dto.title.trim(), description: dto.description?.trim() || null, url: dto.url ?? null, fileId: dto.fileId ?? null },
        include,
      });
      await this.audit.record({ action: 'coaching.resource_shared', targetType: 'coach_resource', targetId: created.id, metadata: { clientMembershipId: client?.id ?? null, hasFile: Boolean(dto.fileId), hasLink: Boolean(dto.url) } }, tx);
      return created;
    });
    const recipients = client ? [client.id] : await this.assignedClients(t.membershipId);
    await this.reach.notify(recipients, 'coaching.resource_shared', { params: { title: row.title, name: row.creator.user.fullName }, audience: 'client' });
    return this.toDto(row);
  }

  private async assignedClients(coachMembershipId: string): Promise<string[]> {
    const rows = await this.tenant.db.memberAssignment.findMany({ where: { practitionerMembershipId: coachMembershipId, endedAt: null }, select: { participantMembershipId: true } });
    return rows.map((r) => r.participantMembershipId);
  }

  /** The creator withdraws a resource (owners can too); its file is removed. */
  async archive(id: string): Promise<void> {
    const r = await this.tenant.db.coachResource.findFirst({ where: { id, archivedAt: null } });
    if (!r || !(await this.authz.allows('coaching.resource.manage', { ownerMembershipId: r.createdByMembershipId }))) throw new AppError('NOT_FOUND');
    await this.tenant.db.$transaction(async (tx) => {
      await tx.coachResource.update({ where: { id }, data: { archivedAt: new Date(), fileId: null } });
      await this.audit.record({ action: 'coaching.resource_archived', targetType: 'coach_resource', targetId: id }, tx);
    });
    if (r.fileId) await this.files.remove(r.fileId).catch(() => undefined);
  }
}
