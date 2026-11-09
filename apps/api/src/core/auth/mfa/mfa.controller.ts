import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../../config/env.js';
import { CurrentUser, type AuthUser } from '../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { AuthService } from '../auth.service.js';
import { readClientInfo } from '../client-info.js';
import { setRefreshCookie } from '../refresh-cookie.js';
import { toUserDto } from '../../users/user.mapper.js';
import { MfaService } from './mfa.service.js';

class CodeDto {
  @ApiProperty({ description: '6-digit authenticator code' })
  @Matches(/^\d{6}$/)
  code!: string;
}

class MfaLoginDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  mfaToken!: string;

  @ApiProperty({ description: '6-digit authenticator code or a recovery code (xxxxx-xxxxx)' })
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  code!: string;
}

class DisableMfaDto extends CodeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(256)
  password!: string;
}

@ApiTags('mfa')
@Controller()
export class MfaController {
  constructor(
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('me/mfa/enroll')
  @HttpCode(200)
  async enroll(@CurrentUser() user: AuthUser) {
    return { data: await this.mfa.enroll(user.userId) };
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('me/mfa/confirm')
  @HttpCode(200)
  async confirm(@CurrentUser() user: AuthUser, @Body() dto: CodeDto) {
    return { data: await this.mfa.confirm(user.userId, user.sessionId, dto.code) };
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('me/mfa/disable')
  @HttpCode(204)
  async disable(@CurrentUser() user: AuthUser, @Body() dto: DisableMfaDto) {
    await this.mfa.disable(user.userId, dto.password, dto.code);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/mfa/login')
  @HttpCode(200)
  async login(@Body() dto: MfaLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const client = readClientInfo(req);
    const session = await this.auth.completeMfaLogin(dto.mfaToken, dto.code, client);
    const isWeb = client.clientType === 'WEB';
    if (isWeb) setRefreshCookie(res, this.config, session.refreshToken);
    return {
      data: {
        tokenType: 'Bearer' as const,
        accessToken: session.accessToken,
        expiresIn: session.expiresIn,
        sessionId: session.sessionId,
        ...(isWeb ? {} : { refreshToken: session.refreshToken }),
        user: toUserDto(session.user),
      },
    };
  }
}
