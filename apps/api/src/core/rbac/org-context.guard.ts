import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { GrantScope } from '@pt/domain';
import type { Request } from 'express';
import { IS_PUBLIC } from '../../common/decorators/public.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * L1 of tenant isolation. For every route containing :orgId it proves the caller has an ACTIVE membership
 * in an organization and loads role and grants from the database. The id in the path is only a selector.
 * Not a member (or no such organization) is always a plain 404.
 */
@Injectable()
export class OrgContextGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { authUser?: AuthUser }>();
    const orgId = (req.params as Record<string, string | undefined>).orgId;
    if (orgId === undefined) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic || !req.authUser) throw new AppError('NOT_FOUND'); // fail closed: org routes are never public
    if (!UUID.test(orgId)) throw new AppError('NOT_FOUND');
    if (!req.authUser.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED');

    const membership = await this.prisma.membership.findFirst({
      where: { organizationId: orgId, userId: req.authUser.userId, status: 'ACTIVE' },
      include: {
        organization: { select: { status: true } },
        role: { include: { permissions: { include: { permission: { select: { code: true } } } } } },
      },
    });
    if (!membership) throw new AppError('NOT_FOUND');
    if (membership.organization.status !== 'ACTIVE') throw new AppError('ORGANIZATION_SUSPENDED');

    requestContext.setTenant({
      orgId,
      membershipId: membership.id,
      roleId: membership.roleId,
      roleKey: membership.role.key,
      roleRank: membership.role.rank,
      grants: Object.fromEntries(membership.role.permissions.map((p) => [p.permission.code, p.grantScope as GrantScope])),
    });
    return true;
  }
}
