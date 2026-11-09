import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from '../../common/decorators/public.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TokenService } from './token.service.js';

/**
 * Global guard, deny by default. Besides verifying the signature it loads the session and user, so
 * revoking a session or suspending a user takes effect on the very next request (not after token expiry).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { authUser?: AuthUser }>();
    const header = req.header('authorization');
    const match = header?.match(/^Bearer (.+)$/i);
    if (!match?.[1]) throw new AppError('UNAUTHENTICATED');

    const claims = await this.tokens.verifyAccessToken(match[1]);
    const session = await this.prisma.userSession.findUnique({
      where: { id: claims.sid },
      include: { user: { select: { id: true, status: true, emailVerifiedAt: true } } },
    });
    if (!session || session.userId !== claims.sub || session.revokedAt) throw new AppError('SESSION_REVOKED');
    if (session.user.status !== 'ACTIVE') throw new AppError('ACCOUNT_SUSPENDED');

    req.authUser = {
      userId: claims.sub,
      sessionId: claims.sid,
      emailVerified: session.user.emailVerifiedAt !== null,
      mfaVerified: session.mfaVerifiedAt !== null,
    };
    requestContext.setUser(claims.sub, claims.sid);
    return true;
  }
}
