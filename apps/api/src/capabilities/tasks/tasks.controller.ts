import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../../common/pagination.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { AddAssigneesDto, AttachFileDto, CommentDto, CreateTaskDto, ListTasksQuery, SetStatusDto, UpdateTaskDto } from './tasks.dto.js';
import { TaskDetailsService } from './task-details.service.js';
import { TasksService } from './tasks.service.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('orgs/:orgId/tasks')
export class TasksController {
  constructor(
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(TaskDetailsService) private readonly details: TaskDetailsService,
  ) {}

  @Get()
  @RequirePermission('task.read')
  list(@Query() q: ListTasksQuery) {
    return this.tasks.list(q);
  }

  @Post()
  @RequirePermission('task.create')
  async create(@Body() dto: CreateTaskDto) {
    return { data: await this.tasks.create(dto) };
  }

  @Get(':taskId')
  @RequirePermission('task.read')
  async get(@Param('taskId', uuid()) id: string) {
    return { data: await this.tasks.get(id) };
  }

  @Patch(':taskId')
  @RequirePermission('task.manage')
  async update(@Param('taskId', uuid()) id: string, @Body() dto: UpdateTaskDto) {
    return { data: await this.tasks.update(id, dto) };
  }

  @Delete(':taskId')
  @HttpCode(204)
  @RequirePermission('task.manage')
  async remove(@Param('taskId', uuid()) id: string) {
    await this.tasks.remove(id);
  }

  @Post(':taskId/status')
  @HttpCode(200)
  @RequirePermission('task.update_status')
  async status(@Param('taskId', uuid()) id: string, @Body() dto: SetStatusDto) {
    return { data: await this.tasks.setMyStatus(id, dto.status) };
  }

  @Post(':taskId/assignees')
  @HttpCode(200)
  @RequirePermission('task.manage', 'task.create')
  async addAssignees(@Param('taskId', uuid()) id: string, @Body() dto: AddAssigneesDto) {
    return { data: await this.tasks.addAssignees(id, dto) };
  }

  @Delete(':taskId/assignees/:membershipId')
  @HttpCode(204)
  @RequirePermission('task.manage')
  async removeAssignee(@Param('taskId', uuid()) id: string, @Param('membershipId', uuid()) membershipId: string) {
    await this.tasks.removeAssignee(id, membershipId);
  }

  @Get(':taskId/history')
  @RequirePermission('task.read')
  async history(@Param('taskId', uuid()) id: string) {
    return { data: await this.tasks.history(id) };
  }

  @Get(':taskId/comments')
  @RequirePermission('task.read')
  comments(@Param('taskId', uuid()) id: string, @Query() q: PageQueryDto) {
    return this.details.listComments(id, q);
  }

  @Post(':taskId/comments')
  @RequirePermission('task.comment')
  async comment(@Param('taskId', uuid()) id: string, @Body() dto: CommentDto) {
    return { data: await this.details.addComment(id, dto.body) };
  }

  @Patch(':taskId/comments/:commentId')
  @RequirePermission('task.comment')
  async editComment(@Param('taskId', uuid()) id: string, @Param('commentId', uuid()) commentId: string, @Body() dto: CommentDto) {
    return { data: await this.details.editComment(id, commentId, dto.body) };
  }

  @Delete(':taskId/comments/:commentId')
  @HttpCode(204)
  @RequirePermission('task.comment')
  async deleteComment(@Param('taskId', uuid()) id: string, @Param('commentId', uuid()) commentId: string) {
    await this.details.deleteComment(id, commentId);
  }

  @Post(':taskId/attachments')
  @HttpCode(204)
  @RequirePermission('task.read', 'file.upload')
  async attach(@Param('taskId', uuid()) id: string, @Body() dto: AttachFileDto) {
    await this.details.attach(id, dto.fileId);
  }

  @Delete(':taskId/attachments/:fileId')
  @HttpCode(204)
  @RequirePermission('task.read')
  async detach(@Param('taskId', uuid()) id: string, @Param('fileId', uuid()) fileId: string) {
    await this.details.detach(id, fileId);
  }
}
