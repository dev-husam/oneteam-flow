import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AnyMember, RequirePermission } from '../../core/rbac/decorators.js';
import { RequestUploadDto } from './files.dto.js';
import { FilesService } from './files.service.js';

@ApiTags('files')
@ApiBearerAuth()
@Controller('orgs/:orgId/files')
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  @Post('uploads')
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @RequirePermission('file.upload')
  @ApiOperation({ summary: 'Step 1: validate type and size, get a signed upload URL. Upload the bytes to it with PUT, then call complete.' })
  async requestUpload(@Body() dto: RequestUploadDto) {
    return { data: await this.files.requestUpload(dto) };
  }

  @Post(':fileId/complete')
  @HttpCode(200)
  @RequirePermission('file.upload')
  @ApiOperation({ summary: 'Step 2: verify the uploaded object (size and content type) and mark the file ready.' })
  async complete(@Param('fileId', new ParseUUIDPipe()) id: string) {
    return { data: await this.files.complete(id) };
  }

  @Get(':fileId')
  @AnyMember()
  async get(@Param('fileId', new ParseUUIDPipe()) id: string) {
    return { data: await this.files.get(id) };
  }

  @Get(':fileId/download-url')
  @AnyMember()
  @ApiOperation({ summary: 'A 60-second signed download URL, issued after the access check.' })
  async downloadUrl(@Param('fileId', new ParseUUIDPipe()) id: string) {
    return { data: await this.files.downloadUrl(id) };
  }

  @Delete(':fileId')
  @HttpCode(204)
  @RequirePermission('file.upload')
  async remove(@Param('fileId', new ParseUUIDPipe()) id: string) {
    await this.files.remove(id);
  }
}
