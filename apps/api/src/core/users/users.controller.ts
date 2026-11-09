import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RegisterDeviceDto, UnregisterDeviceDto, UpdateMeDto } from './dto/me.dto.js';
import { toUserDto } from './user.mapper.js';
import { UsersService } from './users.service.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Current user profile.' })
  async me(@CurrentUser() user: AuthUser) {
    return { data: toUserDto(await this.users.getById(user.userId)) };
  }

  @Patch()
  @ApiOperation({ summary: 'Update profile and preferences.' })
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return { data: toUserDto(await this.users.updateMe(user.userId, dto)) };
  }

  @Post('devices')
  @HttpCode(204)
  @ApiOperation({ summary: 'Register this device for push notifications (Expo push token).' })
  async registerDevice(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    await this.users.registerDevice(user.userId, dto);
  }

  @Delete('devices')
  @HttpCode(204)
  @ApiOperation({ summary: 'Stop push notifications to this device (call on sign-out).' })
  async unregisterDevice(@CurrentUser() user: AuthUser, @Body() dto: UnregisterDeviceDto) {
    await this.users.unregisterDevice(user.userId, dto.expoPushToken);
  }

  @Get('platform-access')
  @ApiOperation({ summary: 'Whether the current user holds a platform role (shows the admin entry point).' })
  async platformAccess(@CurrentUser() user: AuthUser) {
    const roles = await this.users.platformRoles(user.userId);
    return { data: { isPlatformStaff: roles.length > 0, roles } };
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Active sessions (devices) of the current user.' })
  async sessions(@CurrentUser() user: AuthUser) {
    return { data: await this.users.listSessions(user.userId, user.sessionId) };
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign out one of your sessions.' })
  async revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.users.revokeSession(user.userId, id);
  }
}
