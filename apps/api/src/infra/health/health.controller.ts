import { Controller, Get, Headers, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe. Open, reveals nothing.' })
  live() {
    return { data: { status: 'ok' } };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (MySQL, Redis). Requires the x-health-token header when configured.' })
  async ready(@Headers('x-health-token') token?: string) {
    if (this.config.HEALTH_TOKEN && !(token && safeEqual(token, this.config.HEALTH_TOKEN))) {
      throw new AppError('FORBIDDEN');
    }
    const checks: Record<string, 'up' | 'down'> = { mysql: 'down', redis: 'down' };
    await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => (checks.mysql = 'up')).catch(() => undefined),
      this.redis.ping().then(() => (checks.redis = 'up')).catch(() => undefined),
    ]);
    if (Object.values(checks).includes('down')) {
      throw new AppError('SERVICE_UNAVAILABLE', { checks });
    }
    return { data: { status: 'ok', checks } };
  }
}
