import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { randomToken, sha256Hex } from '../../common/util/crypto.js';
import { EmailQueueService } from '../../infra/mail/email-queue.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import type { OneTimeTokenPurpose, User } from '../../generated/prisma/client.js';
import type { ClientInfo } from './client-info.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { MfaService } from './mfa/mfa.service.js';
import { FeaturesService } from '../rbac/features.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto.js';

const VERIFY_TTL_MS = 24 * 3_600_000;
const RESET_TTL_MS = 3_600_000;
/** A refresh token presented again within this window is a concurrent request, not theft. */
const REUSE_GRACE_MS = 5_000;
const LOGIN_FAIL_LIMIT = 5;
const LOGIN_FAIL_WINDOW_S = 15 * 60;
const MAIL_COOLDOWN_S = 60;
const TERMS_DOCUMENT_KEY = 'terms-and-privacy';

export interface IssuedSession {
  user: User;
  sessionId: string;
  accessToken: string;
  expiresIn: number;
  /** Raw opaque refresh token. The controller decides: cookie (web) or response body (native). */
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(EmailQueueService) private readonly mail: EmailQueueService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FeaturesService) private readonly features: FeaturesService,
  ) {}

  // ---------------------------------------------------------------- registration

  /**
   * Always answers the same way whether or not the e-mail is taken, so the endpoint cannot be used to
   * discover who has an account. Existing owners get an "email-exists" notice instead.
   */
  /** With open sign-up switched off, only people holding a pending invitation to this address can create an account. */
  private async assertRegistrationOpen(email: string): Promise<void> {
    if (await this.features.isEnabled('registration')) return;
    const invited = await this.prisma.invitation.findFirst({ where: { email: email.toLowerCase(), status: 'PENDING', expiresAt: { gt: new Date() } }, select: { id: true } });
    if (!invited) throw new AppError('FEATURE_DISABLED', { feature: 'registration' });
  }

  async register(dto: RegisterDto, ip?: string): Promise<void> {
    if (dto.acceptTerms !== true) throw new AppError('CONSENT_REQUIRED');
    await this.assertRegistrationOpen(dto.email);
    this.passwords.assertAcceptable(dto.password, dto.email);
    const passwordHash = await this.passwords.hash(dto.password); // hashed on both paths: equal timing

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      await this.mail.enqueue({ template: 'email-exists', userId: existing.id });
      return;
    }

    try {
      const { user, token } = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: dto.email,
            fullName: dto.fullName,
            passwordHash,
            locale: dto.locale ?? 'en',
            consentRecords: {
              create: { documentKey: TERMS_DOCUMENT_KEY, documentVersion: this.config.TERMS_VERSION, ip },
            },
          },
        });
        const raw = randomToken();
        await tx.oneTimeToken.create({
          data: {
            userId: created.id,
            purpose: 'EMAIL_VERIFY',
            tokenHash: sha256Hex(raw),
            expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
          },
        });
        return { user: created, token: raw };
      });
      await this.mail.enqueue({ template: 'verify-email', userId: user.id, token });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return; // lost a registration race: same neutral answer
      throw err;
    }
  }

  async verifyEmail(token: string): Promise<void> {
    const row = await this.consumeToken(token, 'EMAIL_VERIFY');
    await this.prisma.user.updateMany({
      where: { id: row.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async resendVerification(email: string): Promise<void> {
    if (!(await this.takeMailCooldown('verify', email))) return;
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt || user.status !== 'ACTIVE') return;
    const raw = await this.issueToken(user.id, 'EMAIL_VERIFY', VERIFY_TTL_MS);
    await this.mail.enqueue({ template: 'verify-email', userId: user.id, token: raw });
  }

  // ---------------------------------------------------------------- login / sessions

  async login(dto: LoginDto, client: ClientInfo): Promise<IssuedSession | { mfaRequired: true; mfaToken: string }> {
    const failKey = `auth:fail:${sha256Hex(dto.email)}`;
    const failures = Number(await this.redis.get(failKey)) || 0;
    if (failures >= LOGIN_FAIL_LIMIT) throw new AppError('TOO_MANY_LOGIN_ATTEMPTS');

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const ok = await this.passwords.verify(user?.passwordHash ?? null, dto.password);
    if (!user || !ok) {
      const count = await this.redis.incr(failKey);
      if (count === 1) await this.redis.expire(failKey, LOGIN_FAIL_WINDOW_S);
      this.logger.warn({ event: 'auth.login_failed', ip: client.ip }, 'Login failed');
      throw new AppError('INVALID_CREDENTIALS');
    }
    // Status is revealed only after the password was proven correct (no account probing).
    if (user.status !== 'ACTIVE') throw new AppError('ACCOUNT_SUSPENDED');

    await this.redis.del(failKey);
    // Password proven. With MFA on, no session exists until the second factor is verified.
    if (user.mfaEnabled) return { mfaRequired: true, mfaToken: await this.tokens.signMfaToken(user.id) };
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({ action: 'auth.login', actorUserId: user.id, organizationId: null, targetType: 'user', targetId: user.id, metadata: { client: client.clientType } });
    return this.startSession(user, client, false);
  }

  /** Step 2 of sign-in for accounts with MFA. */
  async completeMfaLogin(mfaToken: string, code: string, client: ClientInfo): Promise<IssuedSession> {
    const userId = await this.tokens.verifyMfaToken(mfaToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE' || !user.mfaEnabled) throw new AppError('MFA_TOKEN_INVALID');
    if (!(await this.mfa.verifyCode(userId, code))) {
      await this.mfa.recordFailure(userId);
      this.logger.warn({ event: 'auth.mfa_failed', userId, ip: client.ip }, 'MFA code rejected');
      throw new AppError('MFA_CODE_INVALID');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({ action: 'auth.login', actorUserId: user.id, organizationId: null, targetType: 'user', targetId: user.id, metadata: { client: client.clientType, mfa: true } });
    return this.startSession(user, client, true);
  }

  private async startSession(user: User, client: ClientInfo, mfaVerified: boolean): Promise<IssuedSession> {
    const raw = randomToken();
    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        clientType: client.clientType,
        deviceName: client.deviceName,
        ip: client.ip,
        userAgent: client.userAgent,
        mfaVerifiedAt: mfaVerified ? new Date() : null,
        refreshTokens: {
          create: { tokenHash: sha256Hex(raw), expiresAt: this.refreshExpiry() },
        },
      },
    });
    const access = await this.tokens.signAccessToken({ sub: user.id, sid: session.id });
    return { user, sessionId: session.id, accessToken: access.token, expiresIn: access.expiresIn, refreshToken: raw };
  }

  /**
   * Rotates the refresh token. A token that was already used is a theft signal: outside the 5 s concurrency
   * grace window the whole session is revoked.
   */
  async refresh(presented: string): Promise<IssuedSession> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(presented) },
      include: { session: { include: { user: true } } },
    });
    if (!row || row.session.revokedAt) throw new AppError('REFRESH_TOKEN_INVALID');

    if (row.usedAt) {
      if (Date.now() - row.usedAt.getTime() > REUSE_GRACE_MS) {
        await this.revokeSession(row.sessionId, 'refresh_token_reuse');
        this.logger.warn(
          { event: 'auth.refresh_reuse_detected', userId: row.session.userId, sessionId: row.sessionId },
          'Refresh token reuse detected: session revoked',
        );
        await this.audit.record({ action: 'auth.refresh_reuse_detected', actorUserId: row.session.userId, organizationId: null, targetType: 'session', targetId: row.sessionId });
      }
      throw new AppError('REFRESH_TOKEN_INVALID');
    }
    if (row.expiresAt.getTime() <= Date.now()) throw new AppError('REFRESH_TOKEN_INVALID');

    const user = row.session.user;
    if (user.status !== 'ACTIVE') {
      await this.revokeSession(row.sessionId, 'account_not_active');
      throw new AppError('ACCOUNT_SUSPENDED');
    }

    const next = randomToken();
    const rotated = await this.prisma.$transaction(async (tx) => {
      // Compare-and-set: only one concurrent request can win the rotation.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return false;
      const created = await tx.refreshToken.create({
        data: { sessionId: row.sessionId, tokenHash: sha256Hex(next), expiresAt: this.refreshExpiry() },
      });
      await tx.refreshToken.update({ where: { id: row.id }, data: { replacedById: created.id } });
      await tx.userSession.update({ where: { id: row.sessionId }, data: { lastUsedAt: new Date() } });
      return true;
    });
    if (!rotated) throw new AppError('REFRESH_TOKEN_INVALID');

    const access = await this.tokens.signAccessToken({ sub: user.id, sid: row.sessionId });
    return { user, sessionId: row.sessionId, accessToken: access.token, expiresIn: access.expiresIn, refreshToken: next };
  }

  /** Revokes the session that owns this refresh token. Silent when the token is unknown. */
  async logout(presented: string | undefined): Promise<void> {
    if (!presented) return;
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256Hex(presented) } });
    if (row) await this.revokeSession(row.sessionId, 'logout');
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'logout_all' },
    });
    await this.prisma.pushDevice.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.record({ action: 'auth.logout_all', actorUserId: userId, organizationId: null, targetType: 'user', targetId: userId });
  }

  async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  // ---------------------------------------------------------------- password reset

  async requestPasswordReset(email: string): Promise<void> {
    if (!(await this.takeMailCooldown('reset', email))) return;
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') return;
    const raw = await this.issueToken(user.id, 'PASSWORD_RESET', RESET_TTL_MS);
    await this.mail.enqueue({ template: 'reset-password', userId: user.id, token: raw });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const row = await this.prisma.oneTimeToken.findUnique({ where: { tokenHash: sha256Hex(dto.token) }, include: { user: true } });
    if (!row || row.purpose !== 'PASSWORD_RESET' || row.consumedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new AppError('ONE_TIME_TOKEN_INVALID');
    }
    this.passwords.assertAcceptable(dto.password, row.user.email);
    const passwordHash = await this.passwords.hash(dto.password);

    const consumed = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.oneTimeToken.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
      if (claim.count !== 1) return false;
      await tx.user.update({
        where: { id: row.userId },
        // Proving control of the inbox also proves the address.
        data: { passwordHash, emailVerifiedAt: row.user.emailVerifiedAt ?? new Date() },
      });
      await tx.userSession.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'password_reset' },
      });
      await tx.pushDevice.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return true;
    });
    if (!consumed) throw new AppError('ONE_TIME_TOKEN_INVALID');
    await this.audit.record({ action: 'auth.password_reset', actorUserId: row.userId, organizationId: null, targetType: 'user', targetId: row.userId });
    await this.mail.enqueue({ template: 'password-changed', userId: row.userId });
  }

  // ---------------------------------------------------------------- helpers

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  }

  /** Invalidates older unused tokens of the same purpose, then creates a fresh one. */
  private async issueToken(userId: string, purpose: OneTimeTokenPurpose, ttlMs: number): Promise<string> {
    const raw = randomToken();
    await this.prisma.$transaction([
      this.prisma.oneTimeToken.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: new Date() } }),
      this.prisma.oneTimeToken.create({
        data: { userId, purpose, tokenHash: sha256Hex(raw), expiresAt: new Date(Date.now() + ttlMs) },
      }),
    ]);
    return raw;
  }

  private async consumeToken(raw: string, purpose: OneTimeTokenPurpose) {
    const row = await this.prisma.oneTimeToken.findUnique({ where: { tokenHash: sha256Hex(raw) } });
    if (!row || row.purpose !== purpose || row.consumedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new AppError('ONE_TIME_TOKEN_INVALID');
    }
    const claim = await this.prisma.oneTimeToken.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (claim.count !== 1) throw new AppError('ONE_TIME_TOKEN_INVALID');
    return row;
  }

  /** At most one e-mail per address per purpose per minute (silently dropped: the caller answers neutrally). */
  private async takeMailCooldown(purpose: string, email: string): Promise<boolean> {
    const result = await this.redis.set(`auth:mail-cooldown:${purpose}:${sha256Hex(email)}`, '1', 'EX', MAIL_COOLDOWN_S, 'NX');
    return result === 'OK';
  }
}
