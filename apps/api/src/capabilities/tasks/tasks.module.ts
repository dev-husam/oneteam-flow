import { Module } from '@nestjs/common';
import { TaskDetailsService } from './task-details.service.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({ controllers: [TasksController], providers: [TasksService, TaskDetailsService], exports: [TasksService] })
export class TasksModule {}
