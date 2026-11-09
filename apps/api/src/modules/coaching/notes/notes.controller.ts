import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission, RequiresModule } from '../../../core/rbac/decorators.js';
import { CreateNoteDto, ListNotesQuery, UpdateNoteDto } from './notes.dto.js';
import { NotesService } from './notes.service.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('coaching')
@ApiBearerAuth()
@RequiresModule('coaching')
@Controller('orgs/:orgId/coaching/notes')
export class NotesController {
  constructor(@Inject(NotesService) private readonly notes: NotesService) {}

  /** The notes about one client that the caller may read: shared ones, plus the caller’s private ones (owners: all private ones, audited). */
  @Get()
  @RequirePermission('coaching.note.read')
  async list(@Query() q: ListNotesQuery) {
    return { data: await this.notes.list(q) };
  }

  @Post()
  @RequirePermission('coaching.note.write')
  async create(@Body() dto: CreateNoteDto) {
    return { data: await this.notes.create(dto) };
  }

  @Patch(':noteId')
  @RequirePermission('coaching.note.write')
  async update(@Param('noteId', uuid()) id: string, @Body() dto: UpdateNoteDto) {
    return { data: await this.notes.update(id, dto) };
  }

  @Delete(':noteId')
  @HttpCode(204)
  @RequirePermission('coaching.note.write')
  async remove(@Param('noteId', uuid()) id: string) {
    await this.notes.remove(id);
  }
}
