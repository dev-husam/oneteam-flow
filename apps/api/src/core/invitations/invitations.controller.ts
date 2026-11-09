import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RequirePermission } from '../rbac/decorators.js';
import { CreateInvitationDto, InvitationTokenDto, ListInvitationsQuery } from './invitations.dto.js';
import { InvitationsService } from './invitations.service.js';

@ApiTags('invitations')
@ApiBearerAuth()
@Controller()
export class InvitationsController {
  constructor(@Inject(InvitationsService) private readonly invitations: InvitationsService) {}

  @Post('orgs/:orgId/invitations')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @RequirePermission('member.invite')
  async create(@Body() dto: CreateInvitationDto) {
    return { data: await this.invitations.create(dto) };
  }

  @Get('orgs/:orgId/invitations')
  @RequirePermission('invitation.read')
  list(@Query() q: ListInvitationsQuery) {
    return this.invitations.list(q);
  }

  @Post('orgs/:orgId/invitations/:invitationId/resend')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @RequirePermission('invitation.manage')
  async resend(@Param('invitationId', ParseUUIDPipe) id: string) {
    return { data: await this.invitations.resend(id) };
  }

  @Delete('orgs/:orgId/invitations/:invitationId')
  @HttpCode(204)
  @RequirePermission('invitation.manage')
  async revoke(@Param('invitationId', ParseUUIDPipe) id: string) {
    await this.invitations.revoke(id);
  }

  // ---- invitee side: no organization context yet

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('invitations/preview')
  @HttpCode(200)
  async preview(@Body() dto: InvitationTokenDto) {
    return { data: await this.invitations.preview(dto.token) };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('invitations/accept')
  @HttpCode(200)
  async accept(@Body() dto: InvitationTokenDto, @CurrentUser() user: AuthUser) {
    return { data: await this.invitations.accept(dto.token, user) };
  }
}
