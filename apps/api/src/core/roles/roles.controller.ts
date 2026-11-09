import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnyMember, RequirePermission } from '../rbac/decorators.js';
import { CreateRoleDto, UpdateRoleDto } from './roles.dto.js';
import { RolesService } from './roles.service.js';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('orgs/:orgId')
export class RolesController {
  constructor(@Inject(RolesService) private readonly roles: RolesService) {}

  @Get('roles')
  @RequirePermission('role.read')
  async list() {
    return { data: await this.roles.list() };
  }

  @Get('assignable-roles')
  @AnyMember()
  async assignable() {
    return { data: await this.roles.listAssignable() };
  }

  @Get('permissions')
  @RequirePermission('role.read')
  async permissions() {
    return { data: await this.roles.listPermissions() };
  }

  @Post('roles')
  @RequirePermission('role.manage')
  async create(@Body() dto: CreateRoleDto) {
    return { data: await this.roles.create(dto) };
  }

  @Patch('roles/:roleId')
  @RequirePermission('role.manage')
  async update(@Param('roleId', ParseUUIDPipe) roleId: string, @Body() dto: UpdateRoleDto) {
    return { data: await this.roles.update(roleId, dto) };
  }

  @Delete('roles/:roleId')
  @HttpCode(204)
  @RequirePermission('role.manage')
  async remove(@Param('roleId', ParseUUIDPipe) roleId: string) {
    await this.roles.remove(roleId);
  }
}
