import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnyMember, RequirePermission } from '../rbac/decorators.js';
import { ChangeRoleDto, ListMembersQuery } from './members.dto.js';
import { MembersService } from './members.service.js';

@ApiTags('members')
@ApiBearerAuth()
@Controller('orgs/:orgId')
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  @Get('members')
  @RequirePermission('member.read')
  list(@Query() q: ListMembersQuery) {
    return this.members.list(q);
  }

  @Get('members/:memberId')
  @RequirePermission('member.read')
  async get(@Param('memberId', ParseUUIDPipe) memberId: string) {
    return { data: await this.members.get(memberId) };
  }

  @Post('members/:memberId/role')
  @HttpCode(200)
  @RequirePermission('member.update_role')
  async changeRole(@Param('memberId', ParseUUIDPipe) memberId: string, @Body() dto: ChangeRoleDto) {
    return { data: await this.members.changeRole(memberId, dto) };
  }

  @Post('members/:memberId/suspend')
  @HttpCode(200)
  @RequirePermission('member.suspend')
  async suspend(@Param('memberId', ParseUUIDPipe) memberId: string) {
    return { data: await this.members.setStatus(memberId, 'SUSPENDED') };
  }

  @Post('members/:memberId/reactivate')
  @HttpCode(200)
  @RequirePermission('member.suspend')
  async reactivate(@Param('memberId', ParseUUIDPipe) memberId: string) {
    return { data: await this.members.setStatus(memberId, 'ACTIVE') };
  }

  @Delete('members/:memberId')
  @HttpCode(204)
  @RequirePermission('member.remove')
  async remove(@Param('memberId', ParseUUIDPipe) memberId: string) {
    await this.members.remove(memberId);
  }

  @Post('leave')
  @HttpCode(204)
  @AnyMember()
  async leave() {
    await this.members.leave();
  }
}
