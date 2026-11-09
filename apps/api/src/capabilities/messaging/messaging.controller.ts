import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PageQueryDto } from '../../common/pagination.js';
import { RequirePermission, RequiresFeature } from '../../core/rbac/decorators.js';
import { ContactsQuery, MarkReadDto, ReportMessageDto, ReportsQuery, ResolveReportDto, SendMessageDto, SetBlockedDto, SetMutedDto, StartConversationDto } from './messaging.dto.js';
import { MessagingService } from './messaging.service.js';
import { ModerationService } from './moderation.service.js';

const uuid = () => new ParseUUIDPipe();
/** Writes are rate limited per caller and route: a chat is a conversation, not a firehose. */
const WRITES = { default: { limit: 60, ttl: 60_000 } };

@ApiTags('messaging')
@ApiBearerAuth()
@Controller('orgs/:orgId/messaging')
@RequiresFeature('messaging')
@RequirePermission('message.send')
export class MessagingController {
  constructor(
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(ModerationService) private readonly moderation: ModerationService,
  ) {}

  @Get('contacts')
  contacts(@Query() q: ContactsQuery) {
    return this.messaging.contacts(q);
  }

  @Get('unread-count')
  async unread() {
    return { data: await this.messaging.unreadTotal() };
  }

  @Get('conversations')
  async list() {
    return { data: await this.messaging.list() };
  }

  @Post('conversations')
  @Throttle(WRITES)
  async start(@Body() dto: StartConversationDto) {
    return { data: await this.messaging.start(dto.membershipId) };
  }

  @Get('conversations/:conversationId')
  async get(@Param('conversationId', uuid()) id: string) {
    return { data: await this.messaging.get(id) };
  }

  @Get('conversations/:conversationId/messages')
  listMessages(@Param('conversationId', uuid()) id: string, @Query() q: PageQueryDto) {
    return this.messaging.listMessages(id, q);
  }

  @Post('conversations/:conversationId/messages')
  @Throttle(WRITES)
  async send(@Param('conversationId', uuid()) id: string, @Body() dto: SendMessageDto) {
    return { data: await this.messaging.send(id, dto) };
  }

  @Post('conversations/:conversationId/read')
  @HttpCode(200)
  async read(@Param('conversationId', uuid()) id: string, @Body() dto: MarkReadDto) {
    return { data: await this.messaging.markRead(id, dto.messageId) };
  }

  @Put('conversations/:conversationId/mute')
  async mute(@Param('conversationId', uuid()) id: string, @Body() dto: SetMutedDto) {
    return { data: await this.messaging.setMuted(id, dto.muted) };
  }

  @Put('conversations/:conversationId/block')
  async block(@Param('conversationId', uuid()) id: string, @Body() dto: SetBlockedDto) {
    return { data: await this.messaging.setBlocked(id, dto.blocked) };
  }

  @Post('conversations/:conversationId/messages/:messageId/report')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async report(@Param('conversationId', uuid()) id: string, @Param('messageId', uuid()) messageId: string, @Body() dto: ReportMessageDto) {
    return { data: await this.moderation.report(id, messageId, dto) };
  }

  @Delete('conversations/:conversationId/messages/:messageId')
  @HttpCode(204)
  async remove(@Param('conversationId', uuid()) id: string, @Param('messageId', uuid()) messageId: string) {
    await this.messaging.deleteMessage(id, messageId);
  }
}

/** The moderation queue: owners and admins review what people reported. Separate permission from messaging itself. */
@ApiTags('messaging')
@ApiBearerAuth()
@Controller('orgs/:orgId/messaging/reports')
@RequiresFeature('messaging')
@RequirePermission('message.moderate')
export class MessageReportsController {
  constructor(@Inject(ModerationService) private readonly moderation: ModerationService) {}

  @Get()
  list(@Query() q: ReportsQuery) {
    return this.moderation.list(q);
  }

  @Post(':reportId/resolve')
  @HttpCode(200)
  async resolve(@Param('reportId', uuid()) id: string, @Body() dto: ResolveReportDto) {
    return { data: await this.moderation.resolve(id, dto.outcome, dto.note) };
  }
}
