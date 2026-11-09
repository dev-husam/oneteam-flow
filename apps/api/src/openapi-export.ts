import './config/load-env.js';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { writeFileSync } from 'node:fs';
import { AppModule } from './app.module.js';
import { buildOpenApiDocument } from './bootstrap.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule.register({ withWorker: false }), { logger: false });
app.setGlobalPrefix('api');
app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
await app.init();
writeFileSync(new URL('../openapi.json', import.meta.url), JSON.stringify(buildOpenApiDocument(app), null, 2) + '\n');
await app.close();
