import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../rbac/decorators.js';
import { CreateAssignmentDto, ListAssignmentsQuery } from './assignments.dto.js';
import { AssignmentsService } from './assignments.service.js';

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('orgs/:orgId/assignments')
export class AssignmentsController {
  constructor(@Inject(AssignmentsService) private readonly assignments: AssignmentsService) {}

  @Get()
  @RequirePermission('assignment.read')
  list(@Query() q: ListAssignmentsQuery) {
    return this.assignments.list(q);
  }

  @Post()
  @RequirePermission('assignment.manage')
  async create(@Body() dto: CreateAssignmentDto) {
    return { data: await this.assignments.create(dto) };
  }

  @Post(':assignmentId/end')
  @HttpCode(200)
  @RequirePermission('assignment.manage')
  async end(@Param('assignmentId', ParseUUIDPipe) id: string) {
    return { data: await this.assignments.end(id) };
  }
}
