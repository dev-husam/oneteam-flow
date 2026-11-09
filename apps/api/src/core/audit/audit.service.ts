import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuditActorType, Prisma } from '../../generated/prisma/client.js';
import { requestContext } from '../../common/context/request-context.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface AuditEntry {
  action: string;
  organizationId?: string | null;
  actorUserId?: string | null;
  actorType?: AuditActorType;
  targetType?: string;
  targetId?: string;
  /** Facts about the change (ids, old/new role keys…). Never passwords, tokens or message bodies. */
  metadata?: Record<string, unknown>;
}

/** Anything that can create audit rows inside a transaction (unscoped or tenant-scoped client). */
interface Writer {
  auditLog: { create(args: { data: never }): Promise<unknown> };
}

/** Append-only audit trail. Pass `tx` to make the entry part of the same transaction as the change. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: unknown): Promise<void> {
    const ctx = requestContext.get();
    const data = {
      action: entry.action,
      organizationId: entry.organizationId !== undefined ? entry.organizationId : (ctx?.tenant?.orgId ?? null),
      actorUserId: entry.actorUserId !== undefined ? entry.actorUserId : (ctx?.userId ?? null),
      actorType: entry.actorType ?? ('USER' as const),
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      requestId: ctx?.requestId,
    };
    if (tx) {
      await (tx as Writer).auditLog.create({ data: data as never }); // same transaction: rolls back with the change
      return;
    }
    try {
      await this.prisma.auditLog.create({ data });
    } catch (err) {
      // Outside a transaction an audit failure must not turn a completed action into an error for the user.
      this.logger.error({ err, action: entry.action }, 'Failed to write audit log');
    }
  }
}
