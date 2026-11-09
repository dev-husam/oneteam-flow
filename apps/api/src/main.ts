import './config/load-env.js';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { loadConfig } from './config/env.js';

const config = loadConfig(); // fail fast, before Nest starts
const app = await NestFactory.create<NestExpressApplication>(
  AppModule.register({ withWorker: config.APP_ROLE === 'all' }),
  { bufferLogs: true },
);
configureApp(app);
await app.listen(config.PORT);
app.get(Logger).log(`API listening on :${config.PORT} (role=${config.APP_ROLE})`);
