import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

interface Record_ {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/** Fixed-window counters in Redis so limits hold across API replicas. */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<Record_> {
    const hitsKey = `rl:${throttlerName}:${key}`;
    const blockKey = `rl:block:${throttlerName}:${key}`;

    const blockedFor = await this.redis.pttl(blockKey);
    if (blockedFor > 0) {
      return { totalHits: limit + 1, timeToExpire: 0, isBlocked: true, timeToBlockExpire: Math.ceil(blockedFor / 1000) };
    }

    const results = await this.redis.multi().incr(hitsKey).pttl(hitsKey).exec();
    const totalHits = Number(results?.[0]?.[1] ?? 1);
    let pttl = Number(results?.[1]?.[1] ?? -1);
    if (pttl < 0) {
      await this.redis.pexpire(hitsKey, ttl);
      pttl = ttl;
    }

    let isBlocked = false;
    let timeToBlockExpire = 0;
    if (totalHits > limit && blockDuration > 0) {
      await this.redis.set(blockKey, '1', 'PX', blockDuration);
      isBlocked = true;
      timeToBlockExpire = Math.ceil(blockDuration / 1000);
    }
    return { totalHits, timeToExpire: Math.ceil(pttl / 1000), isBlocked, timeToBlockExpire };
  }
}
