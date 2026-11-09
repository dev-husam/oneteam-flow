import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { PageQueryDto } from '../../common/pagination.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS, NotificationsService } from './notifications.service.js';

class ListNotificationsQuery extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unread?: boolean;
}

class PreferencesQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

class SetPreferenceDto {
  @ApiPropertyOptional({ description: 'Omit for your default across organizations.' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiProperty({ enum: NOTIFICATION_CATEGORIES })
  @IsIn([...NOTIFICATION_CATEGORIES])
  category!: string;

  @ApiProperty({ enum: NOTIFICATION_CHANNELS })
  @IsIn([...NOTIFICATION_CHANNELS])
  channel!: 'IN_APP' | 'PUSH' | 'EMAIL';

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me')
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get('notifications')
  async list(@CurrentUser() user: AuthUser, @Query() q: ListNotificationsQuery) {
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: { locale: true } });
    return this.notifications.list(user.userId, me.locale, q);
  }

  @Get('notifications/unread-count')
  async unread(@CurrentUser() user: AuthUser) {
    return { data: { count: await this.notifications.unreadCount(user.userId) } };
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: AuthUser) {
    await this.notifications.markAllRead(user.userId);
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  async read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.markRead(user.userId, id);
  }

  @Get('notification-preferences')
  async preferences(@CurrentUser() user: AuthUser, @Query() q: PreferencesQuery) {
    return { data: await this.notifications.preferences(user.userId, q.organizationId) };
  }

  @Put('notification-preferences')
  @HttpCode(204)
  async setPreference(@CurrentUser() user: AuthUser, @Body() dto: SetPreferenceDto) {
    await this.notifications.setPreference(user.userId, dto);
  }
}
