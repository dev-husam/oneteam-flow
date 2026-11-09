import { Global, Module } from '@nestjs/common';
import { DesignService } from './design.service.js';
import { MailTemplatesService } from './mail-templates.service.js';
import { PlatformConfigService } from './platform-config.service.js';

@Global()
@Module({ providers: [PlatformConfigService, MailTemplatesService, DesignService], exports: [PlatformConfigService, MailTemplatesService, DesignService] })
export class PlatformConfigModule {}
