import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ANY_MEMBER, REQUIRE_PERMISSION } from './decorators.js';

/**
 * Deny by default for organization routes: a route with :orgId must declare @RequirePermission(...) or
 * @AnyMember(). Missing metadata is a programming error and is refused (and caught by the route-inventory test).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if ((req.params as Record<string, string | undefined>).orgId === undefined) return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ANY_MEMBER, targets)) return true;

    const required = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRE_PERMISSION, targets);
    if (!required || required.length === 0) {
      this.logger.error(`Organization route without permission metadata: ${req.method} ${req.path}`);
      throw new AppError('FORBIDDEN');
    }
    const { grants } = requestContext.tenant();
    if (!required.every((code) => code in grants)) throw new AppError('FORBIDDEN');
    return true;
  }
}
