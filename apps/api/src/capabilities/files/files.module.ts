import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { FilesController } from './files.controller.js';
import { FileAccessRegistry } from './file-access.js';
import { FilesService } from './files.service.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { S3StorageDriver } from './s3-storage.driver.js';
import { STORAGE, type StorageDriver } from './storage.driver.js';
import { StorageController } from './storage.controller.js';

@Module({
  imports: [TasksModule],
  controllers: [FilesController, StorageController],
  providers: [
    FilesService,
    FileAccessRegistry,
    {
      provide: STORAGE,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): StorageDriver =>
        c.STORAGE_DRIVER === 's3'
          ? new S3StorageDriver({ bucket: c.S3_BUCKET!, endpoint: c.S3_ENDPOINT!, region: c.S3_REGION, accessKeyId: c.S3_ACCESS_KEY_ID!, secretAccessKey: c.S3_SECRET_ACCESS_KEY! })
          : new LocalStorageDriver(resolve(c.STORAGE_LOCAL_DIR), c.API_PUBLIC_URL || `http://localhost:${c.PORT}`, c.STORAGE_SIGNING_SECRET ?? 'dev-only-storage-signing-secret'),
    },
  ],
  exports: [FilesService, FileAccessRegistry, STORAGE],
})
export class FilesModule {}
