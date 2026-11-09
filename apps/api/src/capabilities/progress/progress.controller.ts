import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { CreateGoalDto, CreateMetricDto, CreateMilestoneDto, CreateRecordDto, GoalsQuery, GroupSummaryQuery, SeriesQuery, UpdateGoalDto, VoidRecordDto } from './progress.dto.js';
import { ProgressService } from './progress.service.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('progress')
@ApiBearerAuth()
@Controller('orgs/:orgId/progress')
export class ProgressController {
  constructor(@Inject(ProgressService) private readonly progress: ProgressService) {}

  @Get('metrics')
  @RequirePermission('progress.read')
  async metrics() {
    return { data: await this.progress.listMetrics() };
  }

  @Post('metrics')
  @RequirePermission('metric.manage')
  async createMetric(@Body() dto: CreateMetricDto) {
    return { data: await this.progress.createMetric(dto) };
  }

  @Post('records')
  @RequirePermission('progress.record')
  async record(@Body() dto: CreateRecordDto) {
    return { data: await this.progress.record(dto) };
  }

  @Get('records')
  @RequirePermission('progress.read')
  async series(@Query() q: SeriesQuery) {
    return { data: await this.progress.series(q) };
  }

  @Post('records/:recordId/void')
  @HttpCode(204)
  @RequirePermission('progress.record')
  async voidRecord(@Param('recordId', uuid()) id: string, @Body() dto: VoidRecordDto) {
    await this.progress.voidRecord(id, dto.reason);
  }

  @Get('summary')
  @RequirePermission('progress.read')
  async summary(@Query() q: SeriesQuery) {
    return { data: await this.progress.summary({ ...q, metricId: q.metricId! }) };
  }

  @Get('goals')
  @RequirePermission('progress.read')
  async goals(@Query() q: GoalsQuery) {
    return { data: await this.progress.listGoals(q) };
  }

  @Post('goals')
  @RequirePermission('goal.manage')
  async createGoal(@Body() dto: CreateGoalDto) {
    return { data: await this.progress.createGoal(dto) };
  }

  @Patch('goals/:goalId')
  @RequirePermission('goal.manage')
  async updateGoal(@Param('goalId', uuid()) id: string, @Body() dto: UpdateGoalDto) {
    return { data: await this.progress.updateGoal(id, dto) };
  }

  @Post('goals/:goalId/milestones')
  @RequirePermission('goal.manage')
  async addMilestone(@Param('goalId', uuid()) id: string, @Body() dto: CreateMilestoneDto) {
    return { data: await this.progress.addMilestone(id, dto) };
  }

  @Post('goals/:goalId/milestones/:milestoneId/achieve')
  @HttpCode(204)
  @RequirePermission('goal.manage')
  async achieve(@Param('goalId', uuid()) id: string, @Param('milestoneId', uuid()) milestoneId: string) {
    await this.progress.achieveMilestone(id, milestoneId);
  }

  @Get('groups/:groupId/summary')
  @RequirePermission('progress.read', 'group.read')
  async groupSummary(@Param('groupId', uuid()) id: string, @Query() q: GroupSummaryQuery) {
    return { data: await this.progress.groupSummary(id, q.metricId) };
  }
}
