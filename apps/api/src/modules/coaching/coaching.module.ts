import { Module } from '@nestjs/common';
import { FilesModule } from '../../capabilities/files/files.module.js';
import { AssessmentsController } from './assessments/assessments.controller.js';
import { AssessmentsService } from './assessments/assessments.service.js';
import { NotesController } from './notes/notes.controller.js';
import { NotesService } from './notes/notes.service.js';
import { CoachingReach } from './reach.service.js';
import { SessionRemindersService } from './reminders/session-reminders.service.js';
import { CoachingFileAccess } from './resources/coaching-file-access.js';
import { ResourcesController } from './resources/resources.controller.js';
import { ResourcesService } from './resources/resources.service.js';
import { SessionsController } from './sessions/sessions.controller.js';
import { SessionsService } from './sessions/sessions.service.js';

/** The Coaching business module: sessions, notes (private and shared), assessments with trends, shared resources. */
@Module({
  imports: [FilesModule],
  controllers: [SessionsController, NotesController, AssessmentsController, ResourcesController],
  providers: [CoachingReach, SessionsService, NotesService, AssessmentsService, ResourcesService, CoachingFileAccess, SessionRemindersService],
})
export class CoachingModule {}
