import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MailModule } from '../../infra/mail/mail.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { MfaController } from './mfa/mfa.controller.js';
import { MfaService } from './mfa/mfa.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [MailModule],
  controllers: [AuthController, MfaController],
  providers: [
    AuthService,
    MfaService,
    PasswordService,
    TokenService,
    // Registered after ThrottleModule's guard (module import order), so rate limits run first.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TokenService, PasswordService],
})
export class AuthModule {}
