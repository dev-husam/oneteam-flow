import { VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { requestIdMiddleware } from './common/context/request-id.middleware.js';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';
import { createValidationPipe } from './common/pipes/validation.pipe.js';
import { RedisIoAdapter } from './capabilities/messaging/realtime/redis-io.adapter.js';
import { APP_CONFIG, type AppConfig } from './config/env.js';

export function buildOpenApiDocument(app: NestExpressApplication) {
  const options = new DocumentBuilder()
    .setTitle('Personal Trainer Platform API')
    .setDescription('Multi-tenant business management and progress tracking. Errors: { error: { code, message, details?, requestId } }.')
    .setVersion('1')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, options);
}

/** Shared by main.ts and the tests so both run exactly the same HTTP pipeline. */
export function configureApp(app: NestExpressApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);

  app.useWebSocketAdapter(new RedisIoAdapter(app, config));
  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use((req: Request, res: Response, next: NextFunction) => {
    // Request id first, so every log line and error body can be correlated.
    req.headers['x-request-id'] = req.header('x-request-id');
    requestIdMiddleware(req, res, () => {
      req.headers['x-request-id'] = res.getHeader('x-request-id') as string;
      next();
    });
  });

  const strictHelmet = helmet({
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  const docsHelmet = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    (req.path.startsWith('/api/docs') ? docsHelmet : strictHelmet)(req, res, next),
  );

  app.use(cookieParser());
  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-request-id', 'x-client-type', 'x-device-name', 'idempotency-key'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  if (config.SWAGGER_ENABLED) {
    SwaggerModule.setup('api/docs', app, buildOpenApiDocument(app), { jsonDocumentUrl: 'api/docs-json' });
  }
  return config;
}
