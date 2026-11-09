import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../rbac/decorators.js';
import { AddGroupMemberDto, CreateGroupDto, ListGroupsQuery, UpdateGroupDto } from './groups.dto.js';
import { GroupsService } from './groups.service.js';

@ApiTags('groups')
@ApiBearerAuth()
@Controller('orgs/:orgId/groups')
export class GroupsController {
  constructor(@Inject(GroupsService) private readonly groups: GroupsService) {}

  @Get()
  @RequirePermission('group.read')
  list(@Query() q: ListGroupsQuery) {
    return this.groups.list(q);
  }

  @Post()
  @RequirePermission('group.manage')
  async create(@Body() dto: CreateGroupDto) {
    return { data: await this.groups.create(dto) };
  }

  @Get(':groupId')
  @RequirePermission('group.read')
  async get(@Param('groupId', ParseUUIDPipe) id: string) {
    return { data: await this.groups.get(id) };
  }

  @Patch(':groupId')
  @RequirePermission('group.manage')
  async update(@Param('groupId', ParseUUIDPipe) id: string, @Body() dto: UpdateGroupDto) {
    return { data: await this.groups.update(id, dto) };
  }

  @Delete(':groupId')
  @HttpCode(204)
  @RequirePermission('group.manage')
  async archive(@Param('groupId', ParseUUIDPipe) id: string) {
    await this.groups.archive(id);
  }

  @Post(':groupId/members')
  @HttpCode(200)
  @RequirePermission('group.manage')
  async addMember(@Param('groupId', ParseUUIDPipe) id: string, @Body() dto: AddGroupMemberDto) {
    return { data: await this.groups.addMember(id, dto) };
  }

  @Delete(':groupId/members/:membershipId')
  @HttpCode(204)
  @RequirePermission('group.manage')
  async removeMember(@Param('groupId', ParseUUIDPipe) id: string, @Param('membershipId', ParseUUIDPipe) membershipId: string) {
    await this.groups.removeMember(id, membershipId);
  }
}
