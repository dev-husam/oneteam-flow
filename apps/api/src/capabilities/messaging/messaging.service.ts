import { Inject, Injectable } from '@nestjs/common';
import { MESSAGE_MAX_LENGTH, directKey, mayStartConversation, normalizeBody } from '@pt/domain';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage, type PageQueryDto } from '../../common/pagination.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { AuthorizationService } from '../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../core/tenancy/tenant-prisma.service.js';
import { FilesService } from '../files/files.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { SendMessageDto } from './messaging.dto.js';
import { RealtimeService } from './realtime/realtime.service.js';

const FOREVER = new Date('9999-12-31T00:00:00.000Z');
const PREVIEW = 140;

type MessageRow = {
  id: string;
  conversationId: string;
  senderMembershipId: string;
  kind: string;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
  sender: { user: { fullName: string } };
  attachments: { file: { id: string; originalName: string; mimeType: string; sizeBytes: bigint } }[];
};
const MESSAGE_INCLUDE = {
  sender: { select: { user: { select: { fullName: true } } } },
  attachments: { select: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } } },
} as const;

/** Private one-to-one messaging inside an organization. Everything starts from "is the caller a participant?". */
@Injectable()
export class MessagingService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ shaping

  toMessage(m: MessageRow) {
    const deleted = m.deletedAt !== null;
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderMembershipId: m.senderMembershipId,
      senderName: m.sender.user.fullName,
      kind: m.kind,
      body: deleted ? '' : m.body,
      deleted,
      createdAt: m.createdAt,
      attachments: deleted ? [] : m.attachments.map((a) => ({ fileId: a.file.id, fileName: a.file.originalName, mimeType: a.file.mimeType, sizeBytes: Number(a.file.sizeBytes) })),
    };
  }

  private unreadWhere(conversationId: string, me: string, lastReadMessageId: string | null) {
    return { conversationId, senderMembershipId: { not: me }, deletedAt: null, ...(lastReadMessageId ? { id: { gt: lastReadMessageId } } : {}) };
  }

  private async requireParticipant(conversationId: string) {
    const me = requestContext.tenant().membershipId;
    const row = await this.tenant.db.conversationParticipant.findFirst({ where: { conversationId, membershipId: me } });
    if (!row) throw new AppError('NOT_FOUND'); // not yours = does not exist
    return row;
  }

  private async assigned(a: string, b: string): Promise<boolean> {
    const n = await this.tenant.db.memberAssignment.count({
      where: { endedAt: null, OR: [{ practitionerMembershipId: a, participantMembershipId: b }, { practitionerMembershipId: b, participantMembershipId: a }] },
    });
    return n > 0;
  }

  /** Has either person blocked the other? */
  private async blockedEitherWay(a: string, b: string): Promise<boolean> {
    const n = await this.tenant.db.messageBlock.count({ where: { OR: [{ blockerMembershipId: a, blockedMembershipId: b }, { blockerMembershipId: b, blockedMembershipId: a }] } });
    return n > 0;
  }

  // ------------------------------------------------------------------ people

  /** Active members the caller may start a conversation with, with the conversation if there already is one. */
  async contacts(q: { q?: string } & PageQueryDto) {
    const t = requestContext.tenant();
    const grant = this.authz.grantFor('message.send');
    const limit = pageSize(q);
    const assignedIds =
      grant === 'ASSIGNED'
        ? (await this.tenant.db.memberAssignment.findMany({ where: { endedAt: null, OR: [{ practitionerMembershipId: t.membershipId }, { participantMembershipId: t.membershipId }] }, select: { practitionerMembershipId: true, participantMembershipId: true } }))
            .flatMap((a) => [a.practitionerMembershipId, a.participantMembershipId])
            .filter((id) => id !== t.membershipId)
        : null;
    if (grant !== 'ORG' && grant !== 'ALL' && !assignedIds) return { data: [], meta: { nextCursor: null } };
    const rows = await this.tenant.db.membership.findMany({
      where: {
        status: 'ACTIVE',
        id: { not: t.membershipId, ...(assignedIds ? { in: assignedIds } : {}), ...(q.cursor ? { gt: q.cursor } : {}) },
        role: { permissions: { some: { permission: { code: 'message.send' } } } },
        blocksMade: { none: { blockedMembershipId: t.membershipId } }, // people who blocked you are not offered either
        blocksReceived: { none: { blockerMembershipId: t.membershipId } },
        ...(q.q ? { user: { fullName: { contains: q.q.trim() } } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: { id: true, user: { select: { fullName: true } }, role: { select: { key: true } } },
    });
    const page = toPage(rows, limit);
    const existing = await this.tenant.db.conversation.findMany({
      where: { directKey: { in: page.data.map((m) => directKey(t.membershipId, m.id)) } },
      select: { id: true, directKey: true },
    });
    const byKey = new Map(existing.map((c) => [c.directKey, c.id]));
    return {
      data: page.data.map((m) => ({ membershipId: m.id, fullName: m.user.fullName, roleKey: m.role.key, conversationId: byKey.get(directKey(t.membershipId, m.id)) ?? null })),
      meta: page.meta,
    };
  }

  // ------------------------------------------------------------------ conversations

  /** Find or create the conversation with one person. Starting one needs reach; replying later does not. */
  async start(targetMembershipId: string) {
    const t = requestContext.tenant();
    if (targetMembershipId === t.membershipId) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'membershipId', rules: ['notSelf'] }] });
    const target = await this.tenant.db.membership.findFirst({
      where: { id: targetMembershipId, status: 'ACTIVE' },
      select: { id: true, role: { select: { permissions: { where: { permission: { code: 'message.send' } }, select: { grantScope: true } } } } },
    });
    if (!target) throw new AppError('NOT_FOUND');
    const key = directKey(t.membershipId, target.id);
    const existing = await this.tenant.db.conversation.findFirst({ where: { directKey: key }, select: { id: true } });
    if (existing) return this.summary(existing.id);

    if (target.role.permissions.length === 0) throw new AppError('CONTACT_NOT_ALLOWED'); // they could not use the answer
    if (await this.blockedEitherWay(t.membershipId, target.id)) throw new AppError('CONTACT_NOT_ALLOWED');
    if (!mayStartConversation(this.authz.grantFor('message.send'), { assigned: await this.assigned(t.membershipId, target.id) })) throw new AppError('CONTACT_NOT_ALLOWED');

    try {
      const created = await this.tenant.db.$transaction(async (tx) => {
        const c = await tx.conversation.create({ data: { organizationId: t.orgId, type: 'DIRECT', directKey: key, createdByMembershipId: t.membershipId } });
        await tx.conversationParticipant.createMany({ data: [t.membershipId, target.id].map((membershipId) => ({ organizationId: t.orgId, conversationId: c.id, membershipId })) });
        return c;
      });
      return this.summary(created.id);
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const raced = await this.tenant.db.conversation.findFirstOrThrow({ where: { directKey: key }, select: { id: true } });
      return this.summary(raced.id); // both people started it at the same moment
    }
  }

  private async build(participations: { conversationId: string; lastReadMessageId: string | null; mutedUntil: Date | null; conversation: { id: string; type: string; lastMessageAt: Date | null; createdAt: Date; participants: { membershipId: string; membership: { status: string; role: { key: string }; user: { fullName: string } } }[] } }[]) {
    const me = requestContext.tenant().membershipId;
    const others = participations.flatMap((p) => p.conversation.participants.filter((x) => x.membershipId !== me).map((x) => x.membershipId));
    const blocks = await this.tenant.db.messageBlock.findMany({
      where: { OR: [{ blockerMembershipId: me, blockedMembershipId: { in: others } }, { blockedMembershipId: me, blockerMembershipId: { in: others } }] },
      select: { blockerMembershipId: true, blockedMembershipId: true },
    });
    const blockedByMe = new Set(blocks.filter((b) => b.blockerMembershipId === me).map((b) => b.blockedMembershipId));
    const blockedMe = new Set(blocks.filter((b) => b.blockedMembershipId === me).map((b) => b.blockerMembershipId));
    return Promise.all(
      participations.map(async (p) => {
        const other = p.conversation.participants.find((x) => x.membershipId !== me);
        const [last, unread] = await Promise.all([
          this.tenant.db.message.findFirst({ where: { conversationId: p.conversationId }, orderBy: { id: 'desc' }, include: MESSAGE_INCLUDE }),
          this.tenant.db.message.count({ where: this.unreadWhere(p.conversationId, me, p.lastReadMessageId) }),
        ]);
        return {
          id: p.conversation.id,
          type: p.conversation.type,
          other: other ? { membershipId: other.membershipId, fullName: other.membership.user.fullName, roleKey: other.membership.role.key, active: other.membership.status === 'ACTIVE' } : null,
          lastMessage: last
            ? { id: last.id, senderMembershipId: last.senderMembershipId, preview: last.deletedAt ? '' : last.body.slice(0, PREVIEW), deleted: last.deletedAt !== null, hasAttachments: last.attachments.length > 0, createdAt: last.createdAt }
            : null,
          unreadCount: unread,
          muted: p.mutedUntil !== null && p.mutedUntil > new Date(),
          blockedByMe: other ? blockedByMe.has(other.membershipId) : false,
          /** False when either person blocked the other; the app turns the composer off. */
          canSend: other ? !blockedByMe.has(other.membershipId) && !blockedMe.has(other.membershipId) : false,
          lastMessageAt: p.conversation.lastMessageAt,
          createdAt: p.conversation.createdAt,
        };
      }),
    );
  }

  private readonly participationInclude = {
    conversation: { include: { participants: { include: { membership: { select: { status: true, role: { select: { key: true } }, user: { select: { fullName: true } } } } } } } },
  } as const;

  private async summary(conversationId: string) {
    const me = requestContext.tenant().membershipId;
    const row = await this.tenant.db.conversationParticipant.findFirstOrThrow({ where: { conversationId, membershipId: me }, include: this.participationInclude });
    return (await this.build([row]))[0]!;
  }

  /** The caller's conversations, most recent first (the 100 latest: older ones are reached by search or by messaging again). */
  async list() {
    const me = requestContext.tenant().membershipId;
    const rows = await this.tenant.db.conversationParticipant.findMany({
      where: { membershipId: me },
      include: this.participationInclude,
      orderBy: [{ conversation: { lastMessageAt: 'desc' } }, { conversation: { createdAt: 'desc' } }],
      take: 100,
    });
    return this.build(rows);
  }

  async get(conversationId: string) {
    await this.requireParticipant(conversationId);
    return this.summary(conversationId);
  }

  /** Total unread messages in the organization, for the badge. */
  async unreadTotal(): Promise<{ count: number }> {
    const me = requestContext.tenant().membershipId;
    const mine = await this.tenant.db.conversationParticipant.findMany({ where: { membershipId: me }, select: { conversationId: true, lastReadMessageId: true } });
    const counts = await Promise.all(mine.map((p) => this.tenant.db.message.count({ where: this.unreadWhere(p.conversationId, me, p.lastReadMessageId) })));
    return { count: counts.reduce((a, b) => a + b, 0) };
  }

  // ------------------------------------------------------------------ messages

  /** Newest first; page back in time with `meta.nextCursor`. */
  async listMessages(conversationId: string, q: PageQueryDto) {
    await this.requireParticipant(conversationId);
    const limit = pageSize(q);
    const rows = await this.tenant.db.message.findMany({
      where: { conversationId, ...cursorWhere(q.cursor, 'desc') },
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: MESSAGE_INCLUDE,
    });
    const page = toPage(rows, limit);
    return { data: page.data.map((m) => this.toMessage(m)), meta: page.meta };
  }

  async send(conversationId: string, dto: SendMessageDto) {
    const t = requestContext.tenant();
    await this.requireParticipant(conversationId);
    const body = normalizeBody(dto.body ?? '');
    const fileIds = dto.fileIds ?? [];
    if (body.length > MESSAGE_MAX_LENGTH) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'body', rules: ['maxLength'] }] });
    if (body.length === 0 && fileIds.length === 0) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'body', rules: ['isNotEmpty'] }] });

    if (fileIds.length) {
      // Only your own finished, non-sensitive uploads, and one message per file (access to a file follows its message).
      const files = await this.tenant.db.file.count({ where: { id: { in: fileIds }, uploaderMembershipId: t.membershipId, status: 'READY', deletedAt: null, sensitivity: 'STANDARD' } });
      if (files !== fileIds.length) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'fileIds', rules: ['unknownFile'] }] });
      if (await this.tenant.db.messageAttachment.findFirst({ where: { fileId: { in: fileIds } }, select: { fileId: true } })) throw new AppError('CONFLICT', { reason: 'file_in_use' });
    }

    const others = await this.tenant.db.conversationParticipant.findMany({
      where: { conversationId, membershipId: { not: t.membershipId } },
      include: { membership: { select: { userId: true, status: true } } },
    });
    for (const o of others) if (await this.blockedEitherWay(t.membershipId, o.membershipId)) throw new AppError('CONTACT_NOT_ALLOWED'); // nothing is stored or pushed
    // Notify only when this is their first unread message: a burst of messages is one notification, not twenty.
    const firstUnread = new Map(
      await Promise.all(others.map(async (o) => [o.membershipId, (await this.tenant.db.message.count({ where: this.unreadWhere(conversationId, o.membershipId, o.lastReadMessageId) })) === 0] as const)),
    );

    const message = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.message.create({ data: { organizationId: t.orgId, conversationId, senderMembershipId: t.membershipId, kind: 'TEXT', body } });
      if (fileIds.length) await tx.messageAttachment.createMany({ data: fileIds.map((fileId) => ({ organizationId: t.orgId, messageId: created.id, fileId })) });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
      // Sending a message means you have read the conversation up to here.
      await tx.conversationParticipant.update({ where: { conversationId_membershipId: { conversationId, membershipId: t.membershipId } }, data: { lastReadMessageId: created.id, lastReadAt: created.createdAt } });
      return tx.message.findFirstOrThrow({ where: { id: created.id }, include: MESSAGE_INCLUDE });
    });
    const dtoOut = this.toMessage(message);

    const active = others.filter((o) => o.membership.status === 'ACTIVE');
    this.realtime.emitToMembers(t.orgId, [t.membershipId, ...active.map((o) => o.membershipId)], 'message:new', { organizationId: t.orgId, conversationId, message: dtoOut });

    const now = new Date();
    const toNotify = active.filter((o) => firstUnread.get(o.membershipId) && !(o.mutedUntil && o.mutedUntil > now));
    if (toNotify.length) {
      const org = await this.tenant.db.organization.findFirstOrThrow({ select: { slug: true } });
      // The notification names the sender and carries no message text: previews of private messages stay out of push services.
      await this.notifications.notify({ userIds: toNotify.map((o) => o.membership.userId), organizationId: t.orgId, type: 'message.new', params: { sender: dtoOut.senderName }, data: { orgSlug: org.slug, conversationId } });
    }
    return dtoOut;
  }

  /** Read markers only move forward. Everyone in the conversation is told (read receipts, and the other devices of the reader). */
  async markRead(conversationId: string, messageId?: string) {
    const t = requestContext.tenant();
    const participant = await this.requireParticipant(conversationId);
    const target = messageId
      ? await this.tenant.db.message.findFirst({ where: { id: messageId, conversationId }, select: { id: true } })
      : await this.tenant.db.message.findFirst({ where: { conversationId }, orderBy: { id: 'desc' }, select: { id: true } });
    if (messageId && !target) throw new AppError('NOT_FOUND');
    if (target && (!participant.lastReadMessageId || target.id > participant.lastReadMessageId)) {
      await this.tenant.db.conversationParticipant.update({ where: { conversationId_membershipId: { conversationId, membershipId: t.membershipId } }, data: { lastReadMessageId: target.id, lastReadAt: new Date() } });
      const people = await this.tenant.db.conversationParticipant.findMany({ where: { conversationId, membership: { status: 'ACTIVE' } }, select: { membershipId: true } });
      this.realtime.emitToMembers(t.orgId, people.map((p) => p.membershipId), 'conversation:read', { organizationId: t.orgId, conversationId, membershipId: t.membershipId, messageId: target.id });
    }
    return this.summary(conversationId);
  }

  async setMuted(conversationId: string, muted: boolean) {
    const t = requestContext.tenant();
    await this.requireParticipant(conversationId);
    await this.tenant.db.conversationParticipant.update({ where: { conversationId_membershipId: { conversationId, membershipId: t.membershipId } }, data: { mutedUntil: muted ? FOREVER : null } });
    return this.summary(conversationId);
  }

  /** Block or unblock the other person of a conversation. A blocked person cannot send; nothing else changes (history stays). */
  async setBlocked(conversationId: string, blocked: boolean) {
    const t = requestContext.tenant();
    await this.requireParticipant(conversationId);
    const other = await this.tenant.db.conversationParticipant.findFirstOrThrow({ where: { conversationId, membershipId: { not: t.membershipId } }, select: { membershipId: true } });
    if (blocked) {
      try {
        await this.tenant.db.$transaction(async (tx) => {
          await tx.messageBlock.create({ data: { organizationId: t.orgId, blockerMembershipId: t.membershipId, blockedMembershipId: other.membershipId } });
          await this.audit.record({ action: 'message.blocked', targetType: 'membership', targetId: other.membershipId, metadata: { conversationId } }, tx);
        });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err; // already blocked: nothing to do
      }
    } else {
      await this.tenant.db.$transaction(async (tx) => {
        const { count } = await tx.messageBlock.deleteMany({ where: { blockerMembershipId: t.membershipId, blockedMembershipId: other.membershipId } });
        if (count > 0) await this.audit.record({ action: 'message.unblocked', targetType: 'membership', targetId: other.membershipId, metadata: { conversationId } }, tx);
      });
    }
    return this.summary(conversationId);
  }

  /** Senders delete their own messages. The row stays as a tombstone; the text and the attachments' links are removed. */
  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    const t = requestContext.tenant();
    await this.requireParticipant(conversationId);
    const m = await this.tenant.db.message.findFirst({ where: { id: messageId, conversationId, deletedAt: null }, include: { attachments: { select: { fileId: true } } } });
    if (!m) throw new AppError('NOT_FOUND');
    if (m.senderMembershipId !== t.membershipId) throw new AppError('FORBIDDEN');
    await this.tenant.db.$transaction(async (tx) => {
      await tx.message.update({ where: { id: messageId }, data: { deletedAt: new Date(), body: '' } });
      await tx.messageAttachment.deleteMany({ where: { messageId } });
    });
    for (const a of m.attachments) await this.files.remove(a.fileId).catch(() => undefined);
    const people = await this.tenant.db.conversationParticipant.findMany({ where: { conversationId, membership: { status: 'ACTIVE' } }, select: { membershipId: true } });
    this.realtime.emitToMembers(t.orgId, people.map((p) => p.membershipId), 'message:deleted', { organizationId: t.orgId, conversationId, messageId });
  }
}
