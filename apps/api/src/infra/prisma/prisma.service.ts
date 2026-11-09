import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../generated/prisma/client.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';

/**
 * UNSCOPED Prisma client. Phase 2 adds the tenant-scoped client that every organization-owned
 * repository must use; this one is allow-listed for auth, platform admin and maintenance only.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const url = new URL(config.DATABASE_URL);
    super({
      adapter: new PrismaMariaDb({
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1),
        connectionLimit: 10,
        // Local MySQL 8.4 uses caching_sha2_password without TLS; production uses TLS.
        allowPublicKeyRetrieval: config.NODE_ENV !== 'production',
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
