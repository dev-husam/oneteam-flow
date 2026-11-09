import { Module } from '@nestjs/common';
import { MailModule } from '../../infra/mail/mail.module.js';
import { DesignAdminController } from './design-admin.controller.js';
import { DesignAdminService } from './design-admin.service.js';
import { ConfigAdminController } from './config-admin.controller.js';
import { ConfigAdminService } from './config-admin.service.js';
import { PlatformAdminController } from './platform-admin.controller.js';
import { PlatformAdminService } from './platform-admin.service.js';
import { PublicConfigController } from './public-config.controller.js';

@Module({
  imports: [MailModule],
  controllers: [PlatformAdminController, ConfigAdminController, DesignAdminController, PublicConfigController],
  providers: [PlatformAdminService, ConfigAdminService, DesignAdminService],
})
export class PlatformAdminModule {}
