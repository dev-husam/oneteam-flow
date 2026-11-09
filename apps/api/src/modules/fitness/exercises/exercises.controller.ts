import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission, RequiresModule } from '../../../core/rbac/decorators.js';
import { CreateExerciseDto, ListExercisesQuery, UpdateExerciseDto } from './exercises.dto.js';
import { ExercisesService } from './exercises.service.js';

@ApiTags('fitness')
@ApiBearerAuth()
@RequiresModule('fitness')
@Controller('orgs/:orgId/fitness/exercises')
export class ExercisesController {
  constructor(@Inject(ExercisesService) private readonly exercises: ExercisesService) {}

  @Get()
  @RequirePermission('fitness.exercise.read')
  async list(@Query() q: ListExercisesQuery) {
    return { data: await this.exercises.list(q) };
  }

  @Post()
  @RequirePermission('fitness.exercise.manage')
  async create(@Body() dto: CreateExerciseDto) {
    return { data: await this.exercises.create(dto) };
  }

  @Get(':exerciseId')
  @RequirePermission('fitness.exercise.read')
  async get(@Param('exerciseId', new ParseUUIDPipe()) id: string) {
    return { data: await this.exercises.get(id) };
  }

  @Patch(':exerciseId')
  @RequirePermission('fitness.exercise.manage')
  async update(@Param('exerciseId', new ParseUUIDPipe()) id: string, @Body() dto: UpdateExerciseDto) {
    return { data: await this.exercises.update(id, dto) };
  }

  @Delete(':exerciseId')
  @HttpCode(204)
  @RequirePermission('fitness.exercise.manage')
  async archive(@Param('exerciseId', new ParseUUIDPipe()) id: string) {
    await this.exercises.archive(id);
  }
}
