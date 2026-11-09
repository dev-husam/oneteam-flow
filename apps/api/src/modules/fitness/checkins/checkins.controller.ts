import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission, RequiresFeature, RequiresModule } from '../../../core/rbac/decorators.js';
import { AddPhotoDto, CheckinCommentDto, CompareQuery, ListCheckinsQuery, ReviewCheckinDto, SaveCheckinDto } from './checkins.dto.js';
import { CheckinsService } from './checkins.service.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('fitness')
@ApiBearerAuth()
@RequiresModule('fitness')
@Controller('orgs/:orgId/fitness')
export class CheckinsController {
  constructor(@Inject(CheckinsService) private readonly checkins: CheckinsService) {}

  // ---- the client's own week ("current" or "previous")

  @Get('checkins/week/:week')
  @RequirePermission('fitness.checkin.submit')
  async week(@Param('week') week: string) {
    return { data: await this.checkins.getWeek(week) };
  }

  @Put('checkins/week/:week')
  @RequirePermission('fitness.checkin.submit')
  async save(@Param('week') week: string, @Body() dto: SaveCheckinDto) {
    return { data: await this.checkins.saveWeek(week, dto) };
  }

  @Post('checkins/:checkinId/submit')
  @HttpCode(200)
  @RequirePermission('fitness.checkin.submit')
  async submit(@Param('checkinId', uuid()) id: string) {
    return { data: await this.checkins.submit(id) };
  }

  // ---- reading and reviewing

  @Get('checkins')
  @RequirePermission('fitness.checkin.read')
  list(@Query() q: ListCheckinsQuery) {
    return this.checkins.list(q);
  }

  /** Declared before the :checkinId route so "compare" is not read as an id. */
  @Get('checkins/compare')
  @RequirePermission('fitness.checkin.read')
  async compare(@Query() q: CompareQuery) {
    return { data: await this.checkins.compare(q.from, q.to) };
  }

  @Get('checkins/:checkinId')
  @RequirePermission('fitness.checkin.read')
  async get(@Param('checkinId', uuid()) id: string) {
    return { data: await this.checkins.get(id) };
  }

  @Post('checkins/:checkinId/review')
  @HttpCode(200)
  @RequirePermission('fitness.checkin.review')
  async review(@Param('checkinId', uuid()) id: string, @Body() dto: ReviewCheckinDto) {
    return { data: await this.checkins.review(id, dto) };
  }

  @Post('checkins/:checkinId/comments')
  @RequirePermission('fitness.checkin.read')
  async comment(@Param('checkinId', uuid()) id: string, @Body() dto: CheckinCommentDto) {
    return { data: await this.checkins.comment(id, dto) };
  }

  // ---- progress photos (the images themselves are SENSITIVE files, read through the audited file endpoint)

  @Post('photos')
  @RequiresFeature('progress_photos')
  @RequirePermission('fitness.checkin.submit')
  async addPhoto(@Body() dto: AddPhotoDto) {
    return { data: await this.checkins.addPhoto(dto) };
  }

  @Delete('photos/:photoId')
  @HttpCode(204)
  @RequirePermission('fitness.checkin.submit')
  async removePhoto(@Param('photoId', uuid()) id: string) {
    await this.checkins.removePhoto(id);
  }

  @Get('clients/:membershipId/photos')
  @RequiresFeature('progress_photos')
  @RequirePermission('fitness.photo.read')
  async photos(@Param('membershipId', uuid()) id: string) {
    return { data: await this.checkins.listPhotos(id) };
  }
}
