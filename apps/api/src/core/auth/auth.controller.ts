import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { AppError } from '../../common/errors/app-error.js';
import { UserDto, toUserDto } from '../users/user.mapper.js';
import { AuthService, type IssuedSession } from './auth.service.js';
import { readClientInfo } from './client-info.js';
import { EmailDto, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto, TokenDto } from './dto/auth.dto.js';
import { clearRefreshCookie, readRefreshToken, setRefreshCookie } from './refresh-cookie.js';

const minute = (limit: number) => ({ default: { limit, ttl: 60_000 } });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle(minute(5))
  @Post('register')
  @HttpCode(202)
  @ApiOperation({ summary: 'Create an account. Always answers the same way to prevent account enumeration.' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    await this.auth.register(dto, req.ip);
    return { data: { status: 'verification_sent' } };
  }

  @Public()
  @Throttle(minute(10))
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() dto: TokenDto) {
    await this.auth.verifyEmail(dto.token);
    return { data: { status: 'verified' } };
  }

  @Public()
  @Throttle(minute(3))
  @Post('resend-verification')
  @HttpCode(202)
  async resendVerification(@Body() dto: EmailDto) {
    await this.auth.resendVerification(dto.email);
    return { data: { status: 'accepted' } };
  }

  @Public()
  @Throttle(minute(10))
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sign in. Header x-client-type: web | ios | android is mandatory. Web receives the refresh token as an HttpOnly cookie, native clients in the body.',
  })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, readClientInfo(req));
    if ('mfaRequired' in result) return { data: { mfaRequired: true as const, mfaToken: result.mfaToken } };
    return this.respond(result, req, res);
  }

  @Public()
  @Throttle(minute(30))
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh token and get a new access token.' })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    readClientInfo(req); // enforces the mandatory header
    const { token, fromCookie } = readRefreshToken(req, this.config, dto.refreshToken);
    if (!token) throw new AppError('REFRESH_TOKEN_INVALID');
    try {
      const session = await this.auth.refresh(token);
      return this.respond(session, req, res, fromCookie);
    } catch (err) {
      if (fromCookie) clearRefreshCookie(res, this.config);
      throw err;
    }
  }

  @Public()
  @Throttle(minute(30))
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the session that owns the presented refresh token (cookie or body).' })
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token } = readRefreshToken(req, this.config, dto.refreshToken);
    await this.auth.logout(token);
    clearRefreshCookie(res, this.config);
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke every session of the current user.' })
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.userId);
    clearRefreshCookie(res, this.config);
  }

  @Public()
  @Throttle(minute(5))
  @Post('request-password-reset')
  @HttpCode(202)
  async requestPasswordReset(@Body() dto: EmailDto) {
    await this.auth.requestPasswordReset(dto.email);
    return { data: { status: 'accepted' } };
  }

  @Public()
  @Throttle(minute(5))
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto);
    return { data: { status: 'password_changed' } };
  }

  /** Web clients get the refresh token as a cookie; native clients in the body. */
  private respond(session: IssuedSession, req: Request, res: Response, forceCookie?: boolean) {
    const isWeb = forceCookie ?? req.header('x-client-type')?.toLowerCase() === 'web';
    if (isWeb) setRefreshCookie(res, this.config, session.refreshToken);
    const user: UserDto = toUserDto(session.user);
    return {
      data: {
        tokenType: 'Bearer' as const,
        accessToken: session.accessToken,
        expiresIn: session.expiresIn,
        sessionId: session.sessionId,
        ...(isWeb ? {} : { refreshToken: session.refreshToken }),
        user,
      },
    };
  }
}
