import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePlatformPermission } from '../rbac/decorators.js';
import { AdminAuditQuery, AdminListOrganizationsQuery, AdminListUsersQuery, CatalogStatusDto, PlatformRoleDto } from './platform-admin.dto.js';
import { PlatformAdminService } from './platform-admin.service.js';

/** Everything under /admin requires a platform role, TOTP MFA verified in this session, and is audited. */
@ApiTags('platform-admin')
@ApiBearerAuth()
@Controller('admin')
export class PlatformAdminController {
  constructor(@Inject(PlatformAdminService) private readonly admin: PlatformAdminService) {}

  @Get('stats')
  @RequirePlatformPermission('platform.stats.read')
  async stats() {
    return { data: await this.admin.stats() };
  }

  @Get('health')
  @RequirePlatformPermission('platform.stats.read')
  async health() {
    return { data: await this.admin.health() };
  }

  @Get('users')
  @RequirePlatformPermission('platform.user.read')
  listUsers(@Query() q: AdminListUsersQuery) {
    return this.admin.listUsers(q);
  }

  @Get('users/:userId')
  @RequirePlatformPermission('platform.user.read')
  async getUser(@Param('userId', ParseUUIDPipe) id: string) {
    return { data: await this.admin.getUser(id) };
  }

  @Post('users/:userId/suspend')
  @HttpCode(200)
  @RequirePlatformPermission('platform.user.suspend')
  async suspendUser(@CurrentUser() me: AuthUser, @Param('userId', ParseUUIDPipe) id: string) {
    return { data: await this.admin.setUserStatus(me.userId, id, 'SUSPENDED') };
  }

  @Post('users/:userId/activate')
  @HttpCode(200)
  @RequirePlatformPermission('platform.user.suspend')
  async activateUser(@CurrentUser() me: AuthUser, @Param('userId', ParseUUIDPipe) id: string) {
    return { data: await this.admin.setUserStatus(me.userId, id, 'ACTIVE') };
  }

  @Get('organizations')
  @RequirePlatformPermission('platform.organization.read')
  listOrganizations(@Query() q: AdminListOrganizationsQuery) {
    return this.admin.listOrganizations(q);
  }

  @Get('organizations/:organizationId')
  @RequirePlatformPermission('platform.organization.read')
  async getOrganization(@Param('organizationId', ParseUUIDPipe) id: string) {
    return { data: await this.admin.getOrganization(id) };
  }

  @Post('organizations/:organizationId/suspend')
  @HttpCode(200)
  @RequirePlatformPermission('platform.organization.suspend')
  async suspendOrganization(@CurrentUser() me: AuthUser, @Param('organizationId', ParseUUIDPipe) id: string) {
    return { data: await this.admin.setOrganizationStatus(me.userId, id, 'SUSPENDED') };
  }

  @Post('organizations/:organizationId/activate')
  @HttpCode(200)
  @RequirePlatformPermission('platform.organization.suspend')
  async activateOrganization(@CurrentUser() me: AuthUser, @Param('organizationId', ParseUUIDPipe) id: string) {
    return { data: await this.admin.setOrganizationStatus(me.userId, id, 'ACTIVE') };
  }

  @Get('categories')
  @RequirePlatformPermission('platform.category.manage')
  async categories() {
    return { data: await this.admin.listCategories() };
  }

  @Patch('categories/:key')
  @RequirePlatformPermission('platform.category.manage')
  async setCategory(@CurrentUser() me: AuthUser, @Param('key') key: string, @Body() dto: CatalogStatusDto) {
    return { data: await this.admin.setCategoryStatus(me.userId, key, dto.status) };
  }

  @Get('modules')
  @RequirePlatformPermission('platform.module.manage')
  async modules() {
    return { data: await this.admin.listModules() };
  }

  @Patch('modules/:key')
  @RequirePlatformPermission('platform.module.manage')
  async setModule(@CurrentUser() me: AuthUser, @Param('key') key: string, @Body() dto: CatalogStatusDto) {
    return { data: await this.admin.setModuleStatus(me.userId, key, dto.status) };
  }

  @Get('platform-roles')
  @RequirePlatformPermission('platform.role.manage')
  async platformRoles() {
    return { data: await this.admin.listPlatformRoles() };
  }

  @Post('platform-roles')
  @HttpCode(200)
  @RequirePlatformPermission('platform.role.manage')
  async grant(@CurrentUser() me: AuthUser, @Body() dto: PlatformRoleDto) {
    return { data: await this.admin.grantPlatformRole(me.userId, dto.userId, dto.roleKey) };
  }

  @Delete('platform-roles')
  @HttpCode(200)
  @RequirePlatformPermission('platform.role.manage')
  async revoke(@CurrentUser() me: AuthUser, @Body() dto: PlatformRoleDto) {
    return { data: await this.admin.revokePlatformRole(me.userId, dto.userId, dto.roleKey) };
  }

  @Get('audit-logs')
  @RequirePlatformPermission('platform.audit.read')
  audit(@Query() q: AdminAuditQuery) {
    return this.admin.listAudit(q);
  }
}
