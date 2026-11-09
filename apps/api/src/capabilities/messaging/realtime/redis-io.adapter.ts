import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import type { AppConfig } from '../../../config/env.js';
import { redisConnectionOptions } from '../../../infra/redis/redis.module.js';

/**
 * Socket.IO server with the Redis adapter, so an event emitted on one API instance reaches sockets connected to
 * another. Browsers must come from an allowed origin; the payload size is capped; the bundled client is not served.
 */
export class RedisIoAdapter extends IoAdapter {
  private pub?: Redis;
  private sub?: Redis;

  constructor(app: INestApplicationContext, private readonly config: AppConfig) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.config.CORS_ORIGINS, credentials: false },
      maxHttpBufferSize: 10_000,
      serveClient: false,
    } as ServerOptions) as Server;
    this.pub = new Redis({ ...redisConnectionOptions(this.config.REDIS_URL) });
    this.sub = this.pub.duplicate();
    server.adapter(createAdapter(this.pub, this.sub));
    return server;
  }

  override async close(server: Server): Promise<void> {
    try {
      await super.close(server);
    } finally {
      await Promise.all([this.pub?.quit().catch(() => undefined), this.sub?.quit().catch(() => undefined)]);
    }
  }
}
