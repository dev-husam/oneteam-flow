import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../../config/env.js';
import { AppError } from '../../../common/errors/app-error.js';
import { sha256Hex } from '../../../common/util/crypto.js';
import { SecretBox } from '../../../common/util/secret-box.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { REDIS } from '../../../infra/redis/redis.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { PasswordService } from '../password.service.js';
import { generateSecret, otpauthUri, stepAt, verifyTotp } from './totp.js';

const ISSUER = 'Personal Trainer';
const RECOVERY_CODE_COUNT = 8;
const FAIL_LIMIT = 5;
const FAIL_WINDOW_S = 15 * 60;

const newRecoveryCode = (): string => {
  const raw = randomBytes(5).toString('hex'); // 10 hex chars
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
};
const normalizeRecovery = (code: string): string => code.trim().toLowerCase();

@Injectable()
export class MfaService {
  private readonly box: SecretBox;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.box = new SecretBox(config.MFA_ENCRYPTION_KEY);
  }

  /** Starts enrollment. The factor stays unconfirmed (and unusable) until a valid code proves the app works. */
  async enroll(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, mfaEnabled: true } });
    if (user.mfaEnabled) throw new AppError('MFA_ALREADY_ENABLED');
    const secret = generateSecret();
    await this.prisma.mfaFactor.upsert({
      where: { userId },
      create: { userId, secretEnc: this.box.encrypt(secret) },
      update: { secretEnc: this.box.encrypt(secret), confirmedAt: null, lastUsedStep: null },
    });
    return { secret, otpauthUri: otpauthUri(ISSUER, user.email, secret), issuer: ISSUER, account: user.email };
  }

  /** Confirms enrollment, switches MFA on, and returns the one-time recovery codes (shown exactly once). */
  async confirm(userId: string, sessionId: string, code: string) {
    const factor = await this.prisma.mfaFactor.findUnique({ where: { userId } });
    if (!factor || factor.confirmedAt) throw new AppError(factor ? 'MFA_ALREADY_ENABLED' : 'MFA_NOT_ENABLED');
    await this.throttle(userId);
    const step = verifyTotp(this.box.decrypt(factor.secretEnc), code, Date.now(), null);
    if (step === null) {
      await this.recordFailure(userId);
      throw new AppError('MFA_CODE_INVALID');
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaFactor.update({ where: { userId }, data: { confirmedAt: new Date(), lastUsedStep: BigInt(step) } });
      await tx.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({ data: recoveryCodes.map((c) => ({ userId, codeHash: sha256Hex(normalizeRecovery(c)) })) });
      await tx.userSession.update({ where: { id: sessionId }, data: { mfaVerifiedAt: new Date() } });
      await this.audit.record({ action: 'auth.mfa_enabled', actorUserId: userId, organizationId: null, targetType: 'user', targetId: userId }, tx);
    });
    await this.clearFailures(userId);
    return { recoveryCodes };
  }

  /** Verifies a TOTP code or a single-use recovery code for sign-in or sensitive actions. */
  async verifyCode(userId: string, code: string): Promise<boolean> {
    await this.throttle(userId);
    const factor = await this.prisma.mfaFactor.findUnique({ where: { userId } });
    if (!factor?.confirmedAt) return false;

    const trimmed = code.trim();
    if (/^\d{6}$/.test(trimmed)) {
      const step = verifyTotp(this.box.decrypt(factor.secretEnc), trimmed, Date.now(), factor.lastUsedStep === null ? null : Number(factor.lastUsedStep));
      if (step === null) return false;
      // Compare-and-set: two parallel requests cannot both consume the same step.
      const claimed = await this.prisma.mfaFactor.updateMany({
        where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }] },
        data: { lastUsedStep: BigInt(step) },
      });
      if (claimed.count !== 1) return false;
      await this.clearFailures(userId);
      return true;
    }
    const used = await this.prisma.mfaRecoveryCode.updateMany({
      where: { userId, codeHash: sha256Hex(normalizeRecovery(trimmed)), usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) return false;
    await this.audit.record({ action: 'auth.mfa_recovery_code_used', actorUserId: userId, organizationId: null, targetType: 'user', targetId: userId });
    await this.clearFailures(userId);
    return true;
  }

  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaEnabled: true, passwordHash: true } });
    if (!user.mfaEnabled) throw new AppError('MFA_NOT_ENABLED');
    // Platform staff must keep MFA: it is a condition of their role, not a preference.
    if ((await this.prisma.platformRoleAssignment.count({ where: { userId } })) > 0) throw new AppError('MFA_CANNOT_DISABLE');
    if (!(await this.passwords.verify(user.passwordHash, password))) throw new AppError('INVALID_CREDENTIALS');
    if (!(await this.verifyCode(userId, code))) {
      await this.recordFailure(userId);
      throw new AppError('MFA_CODE_INVALID');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaFactor.delete({ where: { userId } });
      await tx.user.update({ where: { id: userId }, data: { mfaEnabled: false } });
      await tx.userSession.updateMany({ where: { userId }, data: { mfaVerifiedAt: null } });
      await this.audit.record({ action: 'auth.mfa_disabled', actorUserId: userId, organizationId: null, targetType: 'user', targetId: userId }, tx);
    });
  }

  // ---- failed-attempt budget: 5 per 15 minutes per user across confirm, login step 2 and disable

  private key = (userId: string) => `auth:mfa-fail:${userId}`;

  private async throttle(userId: string): Promise<void> {
    if ((Number(await this.redis.get(this.key(userId))) || 0) >= FAIL_LIMIT) throw new AppError('TOO_MANY_LOGIN_ATTEMPTS');
  }

  async recordFailure(userId: string): Promise<void> {
    const count = await this.redis.incr(this.key(userId));
    if (count === 1) await this.redis.expire(this.key(userId), FAIL_WINDOW_S);
  }

  private async clearFailures(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }

  /** Exposed for tests of the replay window. */
  currentStep(): number {
    return stepAt(Date.now());
  }
}
