import { Module } from '@nestjs/common';
import { FilesModule } from '../../capabilities/files/files.module.js';
import { ProgressModule } from '../../capabilities/progress/progress.module.js';
import { ClientsController } from './clients/clients.controller.js';
import { ClientsService } from './clients/clients.service.js';
import { ExercisesController } from './exercises/exercises.controller.js';
import { ExercisesService } from './exercises/exercises.service.js';
import { PlansController } from './plans/plans.controller.js';
import { PlansService } from './plans/plans.service.js';
import { AdherenceService } from './nutrition/adherence.service.js';
import { MealLogsService } from './nutrition/meal-logs.service.js';
import { NutritionAssignmentsService } from './nutrition/nutrition-assignments.service.js';
import { NutritionController } from './nutrition/nutrition.controller.js';
import { NutritionPlansService } from './nutrition/nutrition-plans.service.js';
import { CheckinsController } from './checkins/checkins.controller.js';
import { CheckinsService } from './checkins/checkins.service.js';
import { FitnessFileAccess } from './checkins/fitness-file-access.js';
import { RemindersModule } from './reminders/reminders.module.js';
import { ReachService } from './reach/reach.service.js';
import { AssignmentsService } from './workouts/assignments.service.js';
import { SessionsService } from './workouts/sessions.service.js';
import { WorkoutsController } from './workouts/workouts.controller.js';

/** The Fitness business module: client profiles, exercise library, versioned workout plans, assignments and logs. */
@Module({
  imports: [ProgressModule, FilesModule, RemindersModule],
  controllers: [ExercisesController, ClientsController, PlansController, WorkoutsController, NutritionController, CheckinsController],
  providers: [ReachService, CheckinsService, FitnessFileAccess, AdherenceService, NutritionPlansService, NutritionAssignmentsService, MealLogsService, ExercisesService, ClientsService, PlansService, AssignmentsService, SessionsService],
})
export class FitnessModule {}
