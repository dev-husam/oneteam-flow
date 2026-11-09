import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REQUIRE_PLATFORM_PERMISSION } from './decorators.js';

/**
 * Guards /api/v1/admin/*. Platform permissions live in a separate namespace and role scope, so an organization
 * owner can never reach these routes. Users without a platform role get 404 (the surface is not advertised);
 * platform users must additionally have MFA enabled and verified in this session.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { authUser?: AuthUser; platformGrants?: string[] }>();
    const required = this.reflector.getAllAndOverride<string | undefined>(REQUIRE_PLATFORM_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isAdminPath = /^\/api\/v\d+\/admin(\/|$)/.test(req.path);
    if (!required && !isAdminPath) return true;
    if (!required || !req.authUser) throw new AppError('NOT_FOUND'); // admin path without metadata: fail closed

    const assignments = await this.prisma.platformRoleAssignment.findMany({
      where: { userId: req.authUser.userId, role: { scopeType: 'PLATFORM' } },
      select: { role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } },
    });
    const codes = new Set(assignments.flatMap((a) => a.role.permissions.map((p) => p.permission.code)));
    if (assignments.length === 0) throw new AppError('NOT_FOUND');

    const user = await this.prisma.user.findUnique({ where: { id: req.authUser.userId }, select: { mfaEnabled: true } });
    if (!user?.mfaEnabled || !req.authUser.mfaVerified) throw new AppError('MFA_REQUIRED');
    if (!codes.has(required)) throw new AppError('FORBIDDEN');
    req.platformGrants = [...codes];
    return true;
  }
}
