import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePlatformPermission } from '../rbac/decorators.js';
import { ConfigAdminService } from './config-admin.service.js';

class FlagDto {
  @IsBoolean() enabled!: boolean;
}
class OrgFlagDto {
  /** null removes the override. */
  @IsOptional() @IsBoolean() enabled!: boolean | null;
}
class LogoDto {
  @IsString() mimeType!: string;
  @IsString() data!: string;
}
/** Administrator configuration: feature flags, identity/theme/mail branding/logo and e-mail templates. All writes are audited. */
@ApiTags('platform-admin')
@ApiBearerAuth()
@Controller('admin')
export class ConfigAdminController {
  constructor(@Inject(ConfigAdminService) private readonly config: ConfigAdminService) {}

  // ---- feature flags
  @Get('flags')
  @RequirePlatformPermission('platform.flag.manage')
  async flags() {
    return { data: await this.config.listFlags() };
  }

  @Put('flags/:key')
  @RequirePlatformPermission('platform.flag.manage')
  async setFlag(@CurrentUser() me: AuthUser, @Param('key') key: string, @Body() dto: FlagDto) {
    return { data: await this.config.setFlag(me.userId, key, dto.enabled) };
  }

  @Get('organizations/:organizationId/flags')
  @RequirePlatformPermission('platform.flag.manage')
  async organizationFlags(@Param('organizationId', ParseUUIDPipe) id: string) {
    return { data: await this.config.organizationFlags(id) };
  }

  @Put('organizations/:organizationId/flags/:key')
  @RequirePlatformPermission('platform.flag.manage')
  async setOrganizationFlag(@CurrentUser() me: AuthUser, @Param('organizationId', ParseUUIDPipe) id: string, @Param('key') key: string, @Body() dto: OrgFlagDto) {
    return { data: await this.config.setOrganizationFlag(me.userId, id, key, dto.enabled ?? null) };
  }

  // ---- identity, theme, mail branding, logo
  @Get('settings')
  @RequirePlatformPermission('platform.settings.manage')
  async settings() {
    return { data: await this.config.settings() };
  }

  @Put('settings/identity')
  @RequirePlatformPermission('platform.settings.manage')
  async identity(@CurrentUser() me: AuthUser, @Body() body: Record<string, unknown>) {
    return { data: await this.config.saveSetting(me.userId, 'identity', body) };
  }

  @Put('settings/mail')
  @RequirePlatformPermission('platform.settings.manage')
  async mail(@CurrentUser() me: AuthUser, @Body() body: Record<string, unknown>) {
    return { data: await this.config.saveSetting(me.userId, 'mail', body) };
  }

  @Put('settings/logo')
  @RequirePlatformPermission('platform.settings.manage')
  async setLogo(@CurrentUser() me: AuthUser, @Body() dto: LogoDto) {
    return { data: await this.config.setLogo(me.userId, dto.mimeType, dto.data) };
  }

  @Delete('settings/logo')
  @HttpCode(204)
  @RequirePlatformPermission('platform.settings.manage')
  async removeLogo(@CurrentUser() me: AuthUser) {
    await this.config.removeLogo(me.userId);
  }

  // ---- e-mail templates
  @Get('email-templates')
  @RequirePlatformPermission('platform.template.manage')
  async templates() {
    return { data: await this.config.listTemplates() };
  }

  @Get('email-templates/:key/:locale')
  @RequirePlatformPermission('platform.template.manage')
  async template(@Param('key') key: string, @Param('locale') locale: string) {
    return { data: await this.config.getTemplate(key, locale) };
  }

  @Put('email-templates/:key/:locale')
  @RequirePlatformPermission('platform.template.manage')
  async saveTemplate(@CurrentUser() me: AuthUser, @Param('key') key: string, @Param('locale') locale: string, @Body() body: Record<string, unknown>) {
    return { data: await this.config.saveTemplate(me.userId, key, locale, body) };
  }

  @Delete('email-templates/:key/:locale')
  @RequirePlatformPermission('platform.template.manage')
  async resetTemplate(@CurrentUser() me: AuthUser, @Param('key') key: string, @Param('locale') locale: string) {
    return { data: await this.config.resetTemplate(me.userId, key, locale) };
  }

  @Post('email-templates/:key/:locale/preview')
  @HttpCode(200)
  @RequirePlatformPermission('platform.template.manage')
  async preview(@Param('key') key: string, @Param('locale') locale: string, @Body() body: Record<string, unknown>) {
    return { data: await this.config.previewTemplate(key, locale, body) };
  }

  @Post('email-templates/:key/:locale/test')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePlatformPermission('platform.template.manage')
  async test(@CurrentUser() me: AuthUser, @Param('key') key: string, @Param('locale') locale: string, @Body() body: Record<string, unknown>) {
    return { data: await this.config.testSendTemplate(me.userId, key, locale, body) };
  }
}
