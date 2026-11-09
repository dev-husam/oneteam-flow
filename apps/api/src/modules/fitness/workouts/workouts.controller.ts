import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission, RequiresModule } from '../../../core/rbac/decorators.js';
import { AssignmentsService } from './assignments.service.js';
import { SessionsService } from './sessions.service.js';
import { CompleteSessionDto, CreateAssignmentsDto, ListAssignmentsQuery, ListSessionsQuery, LogSetDto, StartSessionDto } from './workouts.dto.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('fitness')
@ApiBearerAuth()
@RequiresModule('fitness')
@Controller('orgs/:orgId/fitness')
export class WorkoutsController {
  constructor(
    @Inject(AssignmentsService) private readonly assignments: AssignmentsService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
  ) {}

  // ---- assigning plans (staff)

  @Post('plans/:planId/assignments')
  @RequirePermission('fitness.workout_plan.assign', 'fitness.workout_plan.manage')
  async assign(@Param('planId', uuid()) planId: string, @Body() dto: CreateAssignmentsDto) {
    return { data: await this.assignments.create(planId, dto) };
  }

  @Get('assignments')
  @RequirePermission('fitness.workout.read')
  list(@Query() q: ListAssignmentsQuery) {
    return this.assignments.list(q);
  }

  @Get('assignments/:workoutAssignmentId')
  @RequirePermission('fitness.workout.read')
  async getAssignment(@Param('workoutAssignmentId', uuid()) id: string) {
    return { data: await this.assignments.get(id) };
  }

  @Post('assignments/:workoutAssignmentId/cancel')
  @HttpCode(204)
  @RequirePermission('fitness.workout_plan.assign')
  async cancel(@Param('workoutAssignmentId', uuid()) id: string) {
    await this.assignments.cancel(id);
  }

  // ---- the client's own workouts

  @Get('workouts/today')
  @RequirePermission('fitness.workout.log')
  async today() {
    return { data: await this.sessions.today() };
  }

  @Post('sessions')
  @HttpCode(200)
  @RequirePermission('fitness.workout.log')
  async start(@Body() dto: StartSessionDto) {
    return { data: await this.sessions.start(dto) };
  }

  @Get('sessions')
  @RequirePermission('fitness.workout.read')
  listSessions(@Query() q: ListSessionsQuery) {
    return this.sessions.list(q);
  }

  @Get('sessions/:sessionId')
  @RequirePermission('fitness.workout.read')
  async getSession(@Param('sessionId', uuid()) id: string) {
    return { data: await this.sessions.get(id) };
  }

  @Put('sessions/:sessionId/sets')
  @RequirePermission('fitness.workout.log')
  async logSet(@Param('sessionId', uuid()) id: string, @Body() dto: LogSetDto) {
    return { data: await this.sessions.logSet(id, dto) };
  }

  @Delete('sessions/:sessionId/sets/:dayExerciseId/:setNo')
  @RequirePermission('fitness.workout.log')
  async removeSet(@Param('sessionId', uuid()) id: string, @Param('dayExerciseId', uuid()) dayExerciseId: string, @Param('setNo', ParseIntPipe) setNo: number) {
    return { data: await this.sessions.removeSet(id, dayExerciseId, setNo) };
  }

  @Post('sessions/:sessionId/complete')
  @HttpCode(200)
  @RequirePermission('fitness.workout.log')
  async complete(@Param('sessionId', uuid()) id: string, @Body() dto: CompleteSessionDto) {
    return { data: await this.sessions.complete(id, dto) };
  }
}
