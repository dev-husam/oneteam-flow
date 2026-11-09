import { Controller, Get, Header, Inject, NotFoundException, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { PlatformConfigService } from '../../infra/platform-config/platform-config.service.js';

/** What a visitor may know before signing in: name, theme, logo and whether sign-up is open. Nothing here is secret. */
@ApiTags('config')
@Controller('config')
export class PublicConfigController {
  constructor(@Inject(PlatformConfigService) private readonly platform: PlatformConfigService) {}

  @Public()
  @Get('public')
  @Header('Cache-Control', 'public, max-age=30')
  async publicConfig() {
    return { data: await this.platform.publicConfig() };
  }

  @Public()
  @Get('logo')
  async logo(@Req() req: Request, @Res() res: Response) {
    const logo = await this.platform.logoAsset();
    if (!logo) throw new NotFoundException();
    const etag = `"${logo.sha256}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Type', logo.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Not a document: never let a browser render it as one.
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.end(logo.data);
  }
}
