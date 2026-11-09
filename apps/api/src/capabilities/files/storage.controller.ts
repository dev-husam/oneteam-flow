import { Controller, Get, Inject, Param, Put, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { AppError } from '../../common/errors/app-error.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { STORAGE, type StorageDriver } from './storage.driver.js';

/**
 * Serves the LOCAL storage driver's signed URLs (development and tests). In production the S3 driver is used and
 * this controller answers 404. Authorization is the signature itself: it names one key, one operation and an expiry.
 */
@ApiExcludeController()
@Public()
@Controller('storage')
export class StorageController {
  constructor(@Inject(STORAGE) private readonly storage: StorageDriver) {}

  private local(): LocalStorageDriver {
    if (!(this.storage instanceof LocalStorageDriver)) throw new AppError('NOT_FOUND');
    return this.storage;
  }

  @Put('upload/:token')
  async upload(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    const driver = this.local();
    const claims = driver.verify(token, 'upload');
    if (!claims) throw new AppError('FORBIDDEN');
    if ((req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase() !== claims.type) throw new AppError('FILE_TYPE_NOT_ALLOWED');
    const declared = Number(req.header('content-length'));
    if (!Number.isFinite(declared) || declared !== claims.max) throw new AppError('FILE_TOO_LARGE', { reason: 'size_must_match' });

    const target = await driver.prepare(claims.key);
    const tmp = `${target}.part`;
    let received = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length;
        cb(received > claims.max ? new AppError('FILE_TOO_LARGE') : null, chunk);
      },
    });
    try {
      await pipeline(req, counter, createWriteStream(tmp));
      await rename(tmp, target);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
    res.status(200).end();
  }

  @Get('download/:token')
  async download(@Param('token') token: string, @Res() res: Response) {
    const driver = this.local();
    const claims = driver.verify(token, 'download');
    if (!claims || !(await driver.head(claims.key))) throw new AppError('NOT_FOUND');
    res.setHeader('Content-Type', claims.type);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(claims.name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    driver.openRead(claims.key).pipe(res);
  }
}
