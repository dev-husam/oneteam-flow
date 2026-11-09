import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FeatureKey } from '@pt/domain';
import type { Request } from 'express';
import { REQUIRES_FEATURE } from './decorators.js';
import { FeaturesService } from './features.service.js';

/**
 * Routes tied to a feature flag answer FEATURE_DISABLED while the flag is off for the organization in the path.
 * Runs after OrgContextGuard, so a non-member never learns whether a feature is on.
 */
@Injectable()
export class FeatureEnabledGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(FeaturesService) private readonly features: FeaturesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<FeatureKey | undefined>(REQUIRES_FEATURE, [context.getHandler(), context.getClass()]);
    if (!key) return true;
    const req = context.switchToHttp().getRequest<Request>();
    await this.features.require(key, (req.params as Record<string, string | undefined>).orgId);
    return true;
  }
}
