import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { requestContext } from '../../common/context/request-context.js';
import { cursorWhere, PageQueryDto, pageSize, toPage } from '../../common/pagination.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RequirePermission } from '../rbac/decorators.js';

class AuditQuery extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Action prefix, e.g. "member." or "role.created".' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('orgs/:orgId/audit-logs')
export class AuditController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('audit.read')
  async list(@Query() q: AuditQuery) {
    const limit = pageSize(q);
    // AuditLog is a MIXED model: the organization filter is explicit and comes from the verified tenant context.
    const rows = await this.prisma.auditLog.findMany({
      where: { organizationId: requestContext.tenant().orgId, ...cursorWhere(q.cursor, 'desc'), ...(q.action ? { action: { startsWith: q.action } } : {}) },
      orderBy: { id: 'desc' },
      take: limit + 1,
      select: { id: true, action: true, actorUserId: true, actorType: true, targetType: true, targetId: true, metadata: true, createdAt: true, requestId: true },
    });
    const page = toPage(rows, limit);
    const actorIds = [...new Set(page.data.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const actors = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } }) : [];
    const names = new Map(actors.map((a) => [a.id, a.fullName]));
    return { data: page.data.map((r) => ({ ...r, actorName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null })), meta: page.meta };
  }
}
