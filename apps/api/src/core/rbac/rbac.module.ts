import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthorizationService } from './authorization.service.js';
import { CatalogSyncService } from './catalog-sync.service.js';
import { FeatureEnabledGuard } from './feature-enabled.guard.js';
import { FeaturesModule } from './features.module.js';
import { ModuleEnabledGuard } from './module-enabled.guard.js';
import { OrgContextGuard } from './org-context.guard.js';
import { PermissionsGuard } from './permissions.guard.js';
import { PlatformGuard } from './platform.guard.js';

@Global()
@Module({
  imports: [FeaturesModule],
  providers: [
    AuthorizationService,
    CatalogSyncService,
    // Order matters: JwtAuthGuard (AuthModule) → org membership → module enabled → feature enabled → permission → platform.
    { provide: APP_GUARD, useClass: OrgContextGuard },
    { provide: APP_GUARD, useClass: ModuleEnabledGuard },
    { provide: APP_GUARD, useClass: FeatureEnabledGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: PlatformGuard },
  ],
  exports: [AuthorizationService],
})
export class RbacModule {}
