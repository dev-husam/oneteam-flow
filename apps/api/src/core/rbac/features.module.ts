import { Global, Module } from '@nestjs/common';
import { FeaturesService } from './features.service.js';

/** Feature flags are read by the API and by the worker (reminders, notification channels), so they get their own module. */
@Global()
@Module({ providers: [FeaturesService], exports: [FeaturesService] })
export class FeaturesModule {}
