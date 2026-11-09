import { Body, Controller, Get, Inject, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AnyMember, RequirePermission } from '../rbac/decorators.js';
import { CreateOrganizationDto, UpdateOrganizationDto } from './organization.dto.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller()
export class OrganizationsController {
  constructor(@Inject(OrganizationsService) private readonly orgs: OrganizationsService) {}

  @Post('orgs')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Create an organization; the caller becomes its owner.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrganizationDto) {
    return { data: await this.orgs.create(user.userId, user.emailVerified, dto) };
  }

  @Get('catalog/categories')
  @ApiOperation({ summary: 'Business categories available for new organizations.' })
  async categories() {
    return { data: await this.orgs.listEnabledCategories() };
  }

  @Get('me/organizations')
  @ApiOperation({ summary: 'Organizations the current user belongs to.' })
  async mine(@CurrentUser() user: AuthUser) {
    return { data: await this.orgs.listMine(user.userId) };
  }

  @Get('orgs/:orgId')
  @AnyMember()
  async get() {
    return { data: await this.orgs.getCurrent() };
  }

  @Patch('orgs/:orgId')
  @RequirePermission('org.settings.update')
  async update(@Body() dto: UpdateOrganizationDto) {
    return { data: await this.orgs.updateCurrent(dto) };
  }

  @Get('orgs/:orgId/context')
  @AnyMember()
  @ApiOperation({ summary: 'Role, permissions, enabled modules and navigation for the organization shell.' })
  async context() {
    return { data: await this.orgs.context() };
  }
}
