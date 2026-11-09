import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission, RequiresModule } from '../../../core/rbac/decorators.js';
import { CreatePlanDto, CreateVersionDto, ListPlansQuery, UpdatePlanDto } from '../plans/plans.dto.js';
import { MealLogsService } from './meal-logs.service.js';
import { NutritionAssignmentsService } from './nutrition-assignments.service.js';
import { NutritionPlansService } from './nutrition-plans.service.js';
import { AttachPhotoDto, CreateNutritionAssignmentsDto, ListNutritionAssignmentsQuery, LogMealDto, MealLogsQuery, NutritionContentDto, TodayNutritionQuery } from './nutrition.dto.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('fitness')
@ApiBearerAuth()
@RequiresModule('fitness')
@Controller('orgs/:orgId/fitness')
export class NutritionController {
  constructor(
    @Inject(NutritionPlansService) private readonly plans: NutritionPlansService,
    @Inject(NutritionAssignmentsService) private readonly assignments: NutritionAssignmentsService,
    @Inject(MealLogsService) private readonly logs: MealLogsService,
  ) {}

  // ---- plans

  @Get('nutrition-plans')
  @RequirePermission('fitness.nutrition_plan.manage')
  list(@Query() q: ListPlansQuery) {
    return this.plans.list(q);
  }

  @Post('nutrition-plans')
  @RequirePermission('fitness.nutrition_plan.manage')
  async create(@Body() dto: CreatePlanDto) {
    return { data: await this.plans.create(dto) };
  }

  @Get('nutrition-plans/:nutritionPlanId')
  @RequirePermission('fitness.nutrition_plan.manage')
  async get(@Param('nutritionPlanId', uuid()) id: string) {
    return { data: await this.plans.get(id) };
  }

  @Patch('nutrition-plans/:nutritionPlanId')
  @RequirePermission('fitness.nutrition_plan.manage')
  async update(@Param('nutritionPlanId', uuid()) id: string, @Body() dto: UpdatePlanDto) {
    return { data: await this.plans.update(id, dto) };
  }

  @Delete('nutrition-plans/:nutritionPlanId')
  @HttpCode(204)
  @RequirePermission('fitness.nutrition_plan.manage')
  async archive(@Param('nutritionPlanId', uuid()) id: string) {
    await this.plans.archive(id);
  }

  @Post('nutrition-plans/:nutritionPlanId/versions')
  @RequirePermission('fitness.nutrition_plan.manage')
  async createVersion(@Param('nutritionPlanId', uuid()) id: string, @Body() dto: CreateVersionDto) {
    return { data: await this.plans.createVersion(id, dto.fromVersionId) };
  }

  @Get('nutrition-plans/:nutritionPlanId/versions/:nutritionVersionId')
  @RequirePermission('fitness.nutrition_plan.manage')
  async getVersion(@Param('nutritionPlanId', uuid()) id: string, @Param('nutritionVersionId', uuid()) versionId: string) {
    return { data: await this.plans.getVersion(id, versionId) };
  }

  @Put('nutrition-plans/:nutritionPlanId/versions/:nutritionVersionId/content')
  @RequirePermission('fitness.nutrition_plan.manage')
  async saveContent(@Param('nutritionPlanId', uuid()) id: string, @Param('nutritionVersionId', uuid()) versionId: string, @Body() dto: NutritionContentDto) {
    return { data: await this.plans.saveContent(id, versionId, dto) };
  }

  @Post('nutrition-plans/:nutritionPlanId/versions/:nutritionVersionId/publish')
  @HttpCode(200)
  @RequirePermission('fitness.nutrition_plan.manage')
  async publish(@Param('nutritionPlanId', uuid()) id: string, @Param('nutritionVersionId', uuid()) versionId: string) {
    return { data: await this.plans.publish(id, versionId) };
  }

  @Delete('nutrition-plans/:nutritionPlanId/versions/:nutritionVersionId')
  @HttpCode(204)
  @RequirePermission('fitness.nutrition_plan.manage')
  async discardDraft(@Param('nutritionPlanId', uuid()) id: string, @Param('nutritionVersionId', uuid()) versionId: string) {
    await this.plans.discardDraft(id, versionId);
  }

  // ---- assignments

  @Post('nutrition-plans/:nutritionPlanId/assignments')
  @RequirePermission('fitness.nutrition_plan.assign', 'fitness.nutrition_plan.manage')
  async assign(@Param('nutritionPlanId', uuid()) planId: string, @Body() dto: CreateNutritionAssignmentsDto) {
    return { data: await this.assignments.create(planId, dto) };
  }

  @Get('nutrition/assignments')
  @RequirePermission('fitness.nutrition.read')
  listAssignments(@Query() q: ListNutritionAssignmentsQuery) {
    return this.assignments.list(q);
  }

  @Get('nutrition/assignments/:nutritionAssignmentId')
  @RequirePermission('fitness.nutrition.read')
  async getAssignment(@Param('nutritionAssignmentId', uuid()) id: string) {
    return { data: await this.assignments.get(id) };
  }

  @Post('nutrition/assignments/:nutritionAssignmentId/cancel')
  @HttpCode(204)
  @RequirePermission('fitness.nutrition_plan.assign')
  async cancel(@Param('nutritionAssignmentId', uuid()) id: string) {
    await this.assignments.cancel(id);
  }

  // ---- the client's own meals

  @Get('nutrition/today')
  @RequirePermission('fitness.nutrition.log')
  async today(@Query() q: TodayNutritionQuery) {
    return { data: await this.logs.today(q.date) };
  }

  @Put('nutrition/logs')
  @RequirePermission('fitness.nutrition.log')
  async logMeal(@Body() dto: LogMealDto) {
    return { data: await this.logs.log(dto) };
  }

  @Post('nutrition/logs/:mealLogId/photos')
  @HttpCode(200)
  @RequirePermission('fitness.nutrition.log')
  async attachPhoto(@Param('mealLogId', uuid()) id: string, @Body() dto: AttachPhotoDto) {
    return { data: await this.logs.attachPhoto(id, dto.fileId) };
  }

  @Delete('nutrition/logs/:mealLogId/photos/:fileId')
  @RequirePermission('fitness.nutrition.log')
  async detachPhoto(@Param('mealLogId', uuid()) id: string, @Param('fileId', uuid()) fileId: string) {
    return { data: await this.logs.detachPhoto(id, fileId) };
  }

  @Get('nutrition/logs')
  @RequirePermission('fitness.nutrition.read')
  async range(@Query() q: MealLogsQuery) {
    return { data: await this.logs.range(q) };
  }
}
