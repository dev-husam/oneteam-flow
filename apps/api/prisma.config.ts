import { defineConfig } from 'prisma/config';

// Prisma CLI reads DATABASE_URL from the environment (root .env is loaded below when present).
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
} catch {
  /* no .env file: CI and production inject variables directly */
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    // Shadow database used only by `prisma migrate dev`; name must match the pt_% grant in infra/mysql/init.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL ?? process.env.DATABASE_URL?.replace(/\/[^/?]+(\?|$)/, '/pt_shadow$1'),
  },
});
