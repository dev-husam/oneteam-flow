import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePlatformPermission } from '../rbac/decorators.js';
import { DesignAdminService } from './design-admin.service.js';

class DefaultDesignDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{1,39}$/) key!: string;
}
class OrganizationDesignDto {
  /** null returns the organization to the platform default. */
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9-]{1,39}$/) key!: string | null;
}

/** Designs (themes): the platform default, custom designs, and a design for one organization. All writes are audited. */
@ApiTags('platform-admin')
@ApiBearerAuth()
@Controller('admin')
export class DesignAdminController {
  constructor(@Inject(DesignAdminService) private readonly designs: DesignAdminService) {}

  @Get('designs')
  @RequirePlatformPermission('platform.settings.manage')
  async list() {
    return { data: await this.designs.list() };
  }

  @Put('design-default')
  @RequirePlatformPermission('platform.settings.manage')
  async setDefault(@CurrentUser() me: AuthUser, @Body() dto: DefaultDesignDto) {
    return { data: await this.designs.setDefault(me.userId, dto.key) };
  }

  @Get('designs/:key')
  @RequirePlatformPermission('platform.settings.manage')
  async get(@Param('key') key: string) {
    return { data: await this.designs.get(key) };
  }

  @Post('designs')
  @RequirePlatformPermission('platform.settings.manage')
  async create(@CurrentUser() me: AuthUser, @Body() body: Record<string, unknown>) {
    return { data: await this.designs.create(me.userId, body as never) };
  }

  @Patch('designs/:key')
  @RequirePlatformPermission('platform.settings.manage')
  async update(@CurrentUser() me: AuthUser, @Param('key') key: string, @Body() body: Record<string, unknown>) {
    return { data: await this.designs.update(me.userId, key, body as never) };
  }

  @Post('designs/:key/reset')
  @HttpCode(200)
  @RequirePlatformPermission('platform.settings.manage')
  async reset(@CurrentUser() me: AuthUser, @Param('key') key: string) {
    return { data: await this.designs.reset(me.userId, key) };
  }

  @Delete('designs/:key')
  @HttpCode(204)
  @RequirePlatformPermission('platform.settings.manage')
  async remove(@CurrentUser() me: AuthUser, @Param('key') key: string) {
    await this.designs.remove(me.userId, key);
  }

  @Get('organizations/:organizationId/design')
  @RequirePlatformPermission('platform.settings.manage')
  async organizationDesign(@Param('organizationId', ParseUUIDPipe) id: string) {
    return { data: await this.designs.organizationDesign(id) };
  }

  @Put('organizations/:organizationId/design')
  @RequirePlatformPermission('platform.settings.manage')
  async setOrganizationDesign(@CurrentUser() me: AuthUser, @Param('organizationId', ParseUUIDPipe) id: string, @Body() dto: OrganizationDesignDto) {
    return { data: await this.designs.setOrganizationDesign(me.userId, id, dto.key ?? null) };
  }
}
