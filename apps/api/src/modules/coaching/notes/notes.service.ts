import { Inject, Injectable } from '@nestjs/common';
import type { NoteVisibility } from '@pt/domain';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { SecretBox } from '../../../common/util/secret-box.js';
import { APP_CONFIG, type AppConfig } from '../../../config/env.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { AuthorizationService } from '../../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { CoachingReach, userName } from '../reach.service.js';
import type { CreateNoteDto, ListNotesQuery, UpdateNoteDto } from './notes.dto.js';

interface Row { id: string; clientMembershipId: string; authorMembershipId: string; sessionId: string | null; visibility: NoteVisibility; body: string; createdAt: Date; updatedAt: Date; author: { user: { fullName: string } } }
const include = { author: { select: userName } } as const;

/**
 * Notes about a client. SHARED notes are visible to the client; PRIVATE notes are the coach’s own working notes:
 * the text is encrypted in the database (same key as MFA secrets), the client never sees them, and the only readers are
 * the author and holders of `coaching.note.private.read` at organization scope (owners). Reading someone else’s
 * private notes is written to the audit log.
 */
@Injectable()
export class NotesService {
  private readonly box: SecretBox;

  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CoachingReach) private readonly reach: CoachingReach,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.box = new SecretBox(config.MFA_ENCRYPTION_KEY);
  }

  private toDto(n: Row, me: string) {
    return {
      id: n.id, clientMembershipId: n.clientMembershipId, sessionId: n.sessionId, visibility: n.visibility,
      body: n.visibility === 'PRIVATE' ? this.box.decrypt(n.body) : n.body,
      authorMembershipId: n.authorMembershipId, authorName: n.author.user.fullName, mine: n.authorMembershipId === me, createdAt: n.createdAt, updatedAt: n.updatedAt,
    };
  }

  private seal(visibility: NoteVisibility, body: string): string {
    const text = body.trim();
    if (!text) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'body', rules: ['isNotEmpty'] }] });
    return visibility === 'PRIVATE' ? this.box.encrypt(text) : text;
  }

  async list(q: ListNotesQuery) {
    const t = requestContext.tenant();
    const canShared = await this.authz.allows('coaching.note.read', { subjectMembershipId: q.clientMembershipId });
    const privateGrant = this.authz.grantFor('coaching.note.private.read');
    // A coach with the OWN grant may read private notes only about clients in their reach; an owner (ORG) reads all.
    const canPrivate = privateGrant === 'ORG' || (privateGrant === 'OWN' && (await this.authz.allows('coaching.note.write', { subjectMembershipId: q.clientMembershipId })));
    if (!canShared && !canPrivate) throw new AppError('NOT_FOUND');
    const rows = await this.tenant.db.coachNote.findMany({
      where: {
        clientMembershipId: q.clientMembershipId,
        ...(q.sessionId ? { sessionId: q.sessionId } : {}),
        OR: [
          ...(canShared ? [{ visibility: 'SHARED' as const }] : []),
          ...(canPrivate ? [{ visibility: 'PRIVATE' as const, ...(privateGrant === 'ORG' ? {} : { authorMembershipId: t.membershipId }) }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include,
    });
    const others = rows.filter((n) => n.visibility === 'PRIVATE' && n.authorMembershipId !== t.membershipId);
    if (others.length) {
      await this.audit.record({ action: 'coaching.private_notes_read', targetType: 'membership', targetId: q.clientMembershipId, metadata: { count: others.length } });
    }
    return rows.map((n) => this.toDto(n as Row, t.membershipId));
  }

  async create(dto: CreateNoteDto) {
    const t = requestContext.tenant();
    const client = await this.reach.requireClient('coaching.note.write', dto.clientMembershipId);
    if (dto.sessionId) {
      const s = await this.tenant.db.coachSession.findFirst({ where: { id: dto.sessionId, clientMembershipId: client.id }, select: { id: true } });
      if (!s) throw new AppError('NOT_FOUND');
    }
    const body = this.seal(dto.visibility, dto.body);
    const note = await this.tenant.db.$transaction(async (tx) => {
      const n = await tx.coachNote.create({ data: { organizationId: t.orgId, clientMembershipId: client.id, authorMembershipId: t.membershipId, sessionId: dto.sessionId ?? null, visibility: dto.visibility, body }, include });
      // Audit records the fact and the visibility, never the text.
      await this.audit.record({ action: 'coaching.note_created', targetType: 'coach_note', targetId: n.id, metadata: { clientMembershipId: client.id, visibility: dto.visibility } }, tx);
      return n;
    });
    if (dto.visibility === 'SHARED') await this.reach.notify([client.id], 'coaching.note_shared', { params: { name: note.author.user.fullName }, audience: 'client' });
    return this.toDto(note as Row, t.membershipId);
  }

  private async ownNote(id: string) {
    const t = requestContext.tenant();
    const n = await this.tenant.db.coachNote.findFirst({ where: { id, authorMembershipId: t.membershipId }, include });
    if (!n) throw new AppError('NOT_FOUND');
    return n;
  }

  /** Authors edit and delete their own notes; nobody else can, owners included. */
  async update(id: string, dto: UpdateNoteDto) {
    const t = requestContext.tenant();
    const n = await this.ownNote(id);
    const visibility = dto.visibility ?? n.visibility;
    const plain = dto.body ?? (n.visibility === 'PRIVATE' ? this.box.decrypt(n.body) : n.body);
    const updated = await this.tenant.db.$transaction(async (tx) => {
      const row = await tx.coachNote.update({ where: { id }, data: { visibility, body: this.seal(visibility, plain) }, include });
      await this.audit.record({ action: 'coaching.note_updated', targetType: 'coach_note', targetId: id, metadata: { visibility, visibilityChanged: visibility !== n.visibility } }, tx);
      return row;
    });
    if (n.visibility === 'PRIVATE' && visibility === 'SHARED') await this.reach.notify([n.clientMembershipId], 'coaching.note_shared', { params: { name: updated.author.user.fullName }, audience: 'client' });
    return this.toDto(updated as Row, t.membershipId);
  }

  async remove(id: string): Promise<void> {
    const n = await this.ownNote(id);
    await this.tenant.db.$transaction(async (tx) => {
      await tx.coachNote.delete({ where: { id } });
      await this.audit.record({ action: 'coaching.note_deleted', targetType: 'coach_note', targetId: id, metadata: { visibility: n.visibility } }, tx);
    });
  }
}
