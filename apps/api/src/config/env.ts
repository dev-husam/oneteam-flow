import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    APP_ROLE: z.enum(['api', 'worker', 'all']).default('all'),

    WEB_BASE_URL: z.url(),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

    DATABASE_URL: z.string().startsWith('mysql://'),
    REDIS_URL: z.string().startsWith('redis'),

    JWT_PRIVATE_KEY: z.string().optional(),
    JWT_PUBLIC_KEY: z.string().optional(),
    JWT_KEY_ID: z.string().min(1).default('dev-1'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

    /** 32 random bytes, base64. Encrypts TOTP secrets at rest. Required in production. */
    MFA_ENCRYPTION_KEY: z.string().optional(),

    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: bool.default(false),

    MAIL_TRANSPORT: z.enum(['smtp', 'memory']).default('smtp'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().default('Personal Trainer <no-reply@localhost>'),

    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    RATE_LIMIT_ENABLED: bool.default(true),

    /** local = signed URLs served by this API (development, tests); s3 = any S3-compatible store (Cloudflare R2). */
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./data/uploads'),
    /** Public base URL of this API, used in signed local URLs. */
    API_PUBLIC_URL: z.string().default(''),
    STORAGE_SIGNING_SECRET: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    /** expo = send through the Expo Push Service; memory = collect in-process (tests); off = do not send. */
    PUSH_TRANSPORT: z.enum(['expo', 'memory', 'off']).default('off'),

    HEALTH_TOKEN: z.string().optional(),
    SWAGGER_ENABLED: bool.default(true),
    /** How long a process caches feature flags, identity, theme and e-mail templates; a change made in the admin console reaches every instance within this time. */
    CONFIG_CACHE_SECONDS: z.coerce.number().int().min(0).max(60).default(5),
    TERMS_VERSION: z.string().default('2026-11-01'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const need = (key: keyof typeof env) => {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
    };
    need('JWT_PRIVATE_KEY');
    need('JWT_PUBLIC_KEY');
    need('HEALTH_TOKEN');
    need('MFA_ENCRYPTION_KEY');
    if (env.STORAGE_DRIVER === 'local') {
      ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: 'local storage is not allowed in production: use s3' });
    } else {
      for (const k of ['S3_BUCKET', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) need(k);
    }
    if (env.CORS_ORIGINS.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'CORS_ORIGINS is required in production' });
    }
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'COOKIE_SECURE must be true in production' });
    }
    if (env.MAIL_TRANSPORT === 'memory') {
      ctx.addIssue({ code: 'custom', path: ['MAIL_TRANSPORT'], message: 'memory transport is not allowed in production' });
    }
  });

export type AppConfig = z.infer<typeof schema>;

/** The ONLY place that reads process.env. Fails fast with a readable list of problems. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

export const APP_CONFIG = Symbol('APP_CONFIG');
