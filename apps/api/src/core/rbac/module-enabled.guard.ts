import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { REQUIRES_MODULE } from './decorators.js';

/**
 * Business-module routes only work for organizations that have the module enabled and while the platform keeps it
 * enabled. Runs after OrgContextGuard (so the tenant context exists) and before the permission check.
 */
@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if ((req.params as Record<string, string | undefined>).orgId === undefined) return true;
    const key = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_MODULE, [context.getHandler(), context.getClass()]);
    if (!key) return true;
    const enabled = await this.tenant.db.organizationModule.findFirst({
      where: { enabled: true, module: { key, status: 'ENABLED' } },
      select: { moduleId: true },
    });
    if (!enabled) throw new AppError('MODULE_NOT_ENABLED');
    return true;
  }
}
