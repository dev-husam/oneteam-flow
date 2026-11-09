import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  sessionId: string;
  emailVerified: boolean;
  /** True when this session passed the second factor. */
  mfaVerified: boolean;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { authUser: AuthUser }>();
  return req.authUser;
});
