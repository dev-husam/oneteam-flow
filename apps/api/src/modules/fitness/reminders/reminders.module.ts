import { Module } from '@nestjs/common';
import { CheckinStateService } from '../checkins/checkin-state.service.js';
import { RemindersService } from './reminders.service.js';

/** The reminder logic, available wherever it is needed (the API process for tests and manual runs, the worker for the schedule). */
@Module({ providers: [CheckinStateService, RemindersService], exports: [CheckinStateService, RemindersService] })
export class RemindersModule {}
