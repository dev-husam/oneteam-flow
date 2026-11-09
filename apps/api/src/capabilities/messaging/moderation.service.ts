import { Inject, Injectable } from '@nestjs/common';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage, type PageQueryDto } from '../../common/pagination.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { TenantPrismaService } from '../../core/tenancy/tenant-prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { ReportMessageDto } from './messaging.dto.js';

type ReportRow = {
  id: string; reason: string; note: string | null; status: string; snapshotBody: string; snapshotAttachments: unknown; createdAt: Date; resolvedAt: Date | null; resolutionNote: string | null;
  reporter: { id: string; user: { fullName: string } }; reported: { id: string; user: { fullName: string } }; resolver: { user: { fullName: string } } | null;
};
const INCLUDE = {
  reporter: { select: { id: true, user: { select: { fullName: true } } } },
  reported: { select: { id: true, user: { select: { fullName: true } } } },
  resolver: { select: { user: { select: { fullName: true } } } },
} as const;

/**
 * Reporting and reviewing abusive messages. A report shares ONE message (a snapshot, in case it is deleted afterwards)
 * with the people who moderate, never the rest of the conversation. Moderators never review a report they are part of.
 */
@Injectable()
export class ModerationService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  private toDto(r: ReportRow) {
    return {
      id: r.id,
      status: r.status,
      reason: r.reason,
      note: r.note,
      createdAt: r.createdAt,
      reporter: { membershipId: r.reporter.id, fullName: r.reporter.user.fullName },
      reported: { membershipId: r.reported.id, fullName: r.reported.user.fullName },
      snapshot: { body: r.snapshotBody, attachments: (r.snapshotAttachments as { fileName: string; mimeType: string }[] | null) ?? [] },
      resolvedBy: r.resolver?.user.fullName ?? null,
      resolvedAt: r.resolvedAt,
      resolutionNote: r.resolutionNote,
    };
  }

  /** The recipient of a message reports it. Only the other person's, undeleted messages can be reported, once each. */
  async report(conversationId: string, messageId: string, dto: ReportMessageDto) {
    const t = requestContext.tenant();
    const participant = await this.tenant.db.conversationParticipant.findFirst({ where: { conversationId, membershipId: t.membershipId } });
    if (!participant) throw new AppError('NOT_FOUND');
    const message = await this.tenant.db.message.findFirst({
      where: { id: messageId, conversationId, deletedAt: null, senderMembershipId: { not: t.membershipId } },
      include: { attachments: { select: { file: { select: { originalName: true, mimeType: true } } } } },
    });
    if (!message) throw new AppError('NOT_FOUND');
    let created: { id: string };
    try {
      created = await this.tenant.db.$transaction(async (tx) => {
        const r = await tx.messageReport.create({
          data: {
            organizationId: t.orgId, conversationId, messageId, reporterMembershipId: t.membershipId, reportedMembershipId: message.senderMembershipId,
            reason: dto.reason, note: dto.note?.trim() || null, snapshotBody: message.body,
            snapshotAttachments: message.attachments.map((a) => ({ fileName: a.file.originalName, mimeType: a.file.mimeType })),
          },
        });
        await this.audit.record({ action: 'message.reported', targetType: 'message_report', targetId: r.id, metadata: { reason: dto.reason, reportedMembershipId: message.senderMembershipId } }, tx);
        return r;
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw new AppError('CONFLICT', { reason: 'already_reported' });
      throw err;
    }
    // Tell the people who moderate (not the two people involved). The notification names nothing and quotes nothing.
    const moderators = await this.tenant.db.membership.findMany({
      where: { status: 'ACTIVE', id: { notIn: [t.membershipId, message.senderMembershipId] }, role: { permissions: { some: { permission: { code: 'message.moderate' } } } } },
      select: { userId: true },
    });
    if (moderators.length) {
      const org = await this.tenant.db.organization.findFirstOrThrow({ select: { slug: true } });
      await this.notifications.notify({ userIds: moderators.map((m) => m.userId), organizationId: t.orgId, type: 'message.reported', data: { orgSlug: org.slug, reports: '1' } });
    }
    return { id: created.id, status: 'OPEN' };
  }

  private visibleToMe() {
    const me = requestContext.tenant().membershipId;
    return { reporterMembershipId: { not: me }, reportedMembershipId: { not: me } };
  }

  async list(q: PageQueryDto & { status?: string }) {
    const limit = pageSize(q);
    const rows = await this.tenant.db.messageReport.findMany({
      where: { ...this.visibleToMe(), ...(q.status ? { status: q.status } : {}), ...cursorWhere(q.cursor, 'desc') },
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: INCLUDE,
    });
    const page = toPage(rows, limit);
    return { data: page.data.map((r) => this.toDto(r)), meta: page.meta };
  }

  async resolve(reportId: string, outcome: 'DISMISSED' | 'ACTIONED', note?: string) {
    const t = requestContext.tenant();
    const report = await this.tenant.db.messageReport.findFirst({ where: { id: reportId, ...this.visibleToMe() }, include: { reporter: { select: { userId: true } } } });
    if (!report) throw new AppError('NOT_FOUND');
    if (report.status !== 'OPEN') throw new AppError('CONFLICT', { reason: 'already_resolved' });
    const updated = await this.tenant.db.$transaction(async (tx) => {
      const r = await tx.messageReport.update({ where: { id: reportId }, data: { status: outcome, resolvedByMembershipId: t.membershipId, resolvedAt: new Date(), resolutionNote: note?.trim() || null }, include: INCLUDE });
      await this.audit.record({ action: 'message.report_resolved', targetType: 'message_report', targetId: reportId, metadata: { outcome } }, tx);
      return r;
    });
    const org = await this.tenant.db.organization.findFirstOrThrow({ select: { slug: true } });
    await this.notifications.notify({ userIds: [report.reporter.userId], organizationId: t.orgId, type: 'message.report_resolved', data: { orgSlug: org.slug } });
    return this.toDto(updated);
  }
}
