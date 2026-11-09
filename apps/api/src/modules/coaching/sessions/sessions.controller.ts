import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission, RequiresModule } from '../../../core/rbac/decorators.js';
import { CancelSessionDto, CreateSessionDto, ListSessionsQuery, UpdateSessionDto } from './sessions.dto.js';
import { SessionsService } from './sessions.service.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('coaching')
@ApiBearerAuth()
@RequiresModule('coaching')
@Controller('orgs/:orgId/coaching/sessions')
export class SessionsController {
  constructor(@Inject(SessionsService) private readonly sessions: SessionsService) {}

  @Get()
  @RequirePermission('coaching.session.read')
  async list(@Query() q: ListSessionsQuery) {
    return { data: await this.sessions.list(q) };
  }

  @Get(':coachSessionId')
  @RequirePermission('coaching.session.read')
  async get(@Param('coachSessionId', uuid()) id: string) {
    return { data: await this.sessions.get(id) };
  }

  @Post()
  @RequirePermission('coaching.session.manage')
  async create(@Body() dto: CreateSessionDto) {
    return { data: await this.sessions.create(dto) };
  }

  @Patch(':coachSessionId')
  @RequirePermission('coaching.session.manage')
  async update(@Param('coachSessionId', uuid()) id: string, @Body() dto: UpdateSessionDto) {
    return { data: await this.sessions.update(id, dto) };
  }

  @Post(':coachSessionId/cancel')
  @HttpCode(200)
  @RequirePermission('coaching.session.manage')
  async cancel(@Param('coachSessionId', uuid()) id: string, @Body() dto: CancelSessionDto) {
    return { data: await this.sessions.cancel(id, dto) };
  }

  @Post(':coachSessionId/complete')
  @HttpCode(200)
  @RequirePermission('coaching.session.manage')
  async complete(@Param('coachSessionId', uuid()) id: string) {
    return { data: await this.sessions.complete(id) };
  }
}
