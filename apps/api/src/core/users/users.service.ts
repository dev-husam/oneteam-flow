import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { UpdateMeDto } from './dto/me.dto.js';

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getById(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('NOT_FOUND');
    return user;
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const current = await this.getById(userId);
    const phoneChanged = dto.phone !== undefined && dto.phone !== current.phone;
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          fullName: dto.fullName,
          locale: dto.locale,
          timezone: dto.timezone,
          unitSystem: dto.unitSystem,
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          // A new number is unverified until the verification flow exists (Phase 5 notifications).
          ...(phoneChanged ? { phoneVerifiedAt: null } : {}),
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw new AppError('PHONE_ALREADY_REGISTERED');
      throw err;
    }
  }

  /** Platform roles held by the user (empty for almost everyone). Used by clients to show the /admin entry point. */
  async platformRoles(userId: string): Promise<string[]> {
    const rows = await this.prisma.platformRoleAssignment.findMany({
      where: { userId, role: { scopeType: 'PLATFORM' } },
      select: { role: { select: { key: true } } },
    });
    return rows.map((r) => r.role.key);
  }

  /** Registers (or moves) an Expo push token to the current user. A token never stays with a previous account. */
  async registerDevice(userId: string, input: { platform: 'IOS' | 'ANDROID'; expoPushToken: string; locale: string }) {
    await this.prisma.pushDevice.upsert({
      where: { expoPushToken: input.expoPushToken },
      create: { userId, ...input },
      update: { userId, platform: input.platform, locale: input.locale, lastSeenAt: new Date(), revokedAt: null },
    });
  }

  async unregisterDevice(userId: string, expoPushToken: string): Promise<void> {
    await this.prisma.pushDevice.updateMany({ where: { userId, expoPushToken, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      clientType: s.clientType,
      deviceName: s.deviceName,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      current: s.id === currentSessionId,
    }));
  }

  /** Only the owner's own sessions are addressable; anything else is a plain 404 (no existence leak). */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'user_revoked' },
    });
    if (result.count !== 1) throw new AppError('SESSION_NOT_FOUND');
  }
}
