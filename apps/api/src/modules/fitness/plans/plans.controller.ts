import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission, RequiresModule } from '../../../core/rbac/decorators.js';
import { CreatePlanDto, CreateVersionDto, ListPlansQuery, PlanContentDto, UpdatePlanDto } from './plans.dto.js';
import { PlansService } from './plans.service.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('fitness')
@ApiBearerAuth()
@RequiresModule('fitness')
@Controller('orgs/:orgId/fitness/plans')
export class PlansController {
  constructor(@Inject(PlansService) private readonly plans: PlansService) {}

  @Get()
  @RequirePermission('fitness.workout_plan.manage')
  list(@Query() q: ListPlansQuery) {
    return this.plans.list(q);
  }

  @Post()
  @RequirePermission('fitness.workout_plan.manage')
  async create(@Body() dto: CreatePlanDto) {
    return { data: await this.plans.create(dto) };
  }

  @Get(':planId')
  @RequirePermission('fitness.workout_plan.manage')
  async get(@Param('planId', uuid()) id: string) {
    return { data: await this.plans.get(id) };
  }

  @Patch(':planId')
  @RequirePermission('fitness.workout_plan.manage')
  async update(@Param('planId', uuid()) id: string, @Body() dto: UpdatePlanDto) {
    return { data: await this.plans.update(id, dto) };
  }

  @Delete(':planId')
  @HttpCode(204)
  @RequirePermission('fitness.workout_plan.manage')
  async archive(@Param('planId', uuid()) id: string) {
    await this.plans.archive(id);
  }

  @Post(':planId/versions')
  @RequirePermission('fitness.workout_plan.manage')
  async createVersion(@Param('planId', uuid()) id: string, @Body() dto: CreateVersionDto) {
    return { data: await this.plans.createVersion(id, dto.fromVersionId) };
  }

  @Get(':planId/versions/:versionId')
  @RequirePermission('fitness.workout_plan.manage')
  async getVersion(@Param('planId', uuid()) id: string, @Param('versionId', uuid()) versionId: string) {
    return { data: await this.plans.getVersion(id, versionId) };
  }

  @Put(':planId/versions/:versionId/content')
  @RequirePermission('fitness.workout_plan.manage')
  async saveContent(@Param('planId', uuid()) id: string, @Param('versionId', uuid()) versionId: string, @Body() dto: PlanContentDto) {
    return { data: await this.plans.saveContent(id, versionId, dto) };
  }

  @Post(':planId/versions/:versionId/publish')
  @HttpCode(200)
  @RequirePermission('fitness.workout_plan.manage')
  async publish(@Param('planId', uuid()) id: string, @Param('versionId', uuid()) versionId: string) {
    return { data: await this.plans.publish(id, versionId) };
  }

  @Delete(':planId/versions/:versionId')
  @HttpCode(204)
  @RequirePermission('fitness.workout_plan.manage')
  async discardDraft(@Param('planId', uuid()) id: string, @Param('versionId', uuid()) versionId: string) {
    await this.plans.discardDraft(id, versionId);
  }
}
