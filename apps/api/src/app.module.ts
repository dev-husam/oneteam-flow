import { DynamicModule, Module } from '@nestjs/common';
import { ActivityModule } from './capabilities/activity/activity.module.js';
import { NotificationsModule } from './capabilities/notifications/notifications.module.js';
import { NotificationsWorkerModule } from './capabilities/notifications/notifications-worker.module.js';
import { TasksModule } from './capabilities/tasks/tasks.module.js';
import { ProgressModule } from './capabilities/progress/progress.module.js';
import { FilesModule } from './capabilities/files/files.module.js';
import { MessagingModule } from './capabilities/messaging/messaging.module.js';
import { CoachingModule } from './modules/coaching/coaching.module.js';
import { CoachingRemindersWorkerModule } from './modules/coaching/reminders/session-reminders-worker.module.js';
import { FitnessModule } from './modules/fitness/fitness.module.js';
import { FitnessRemindersWorkerModule } from './modules/fitness/reminders/reminders-worker.module.js';
import { ConfigModule } from './config/config.module.js';
import { AuthModule } from './core/auth/auth.module.js';
import { UsersModule } from './core/users/users.module.js';
import { AssignmentsModule } from './core/assignments/assignments.module.js';
import { AuditModule } from './core/audit/audit.module.js';
import { GroupsModule } from './core/groups/groups.module.js';
import { InvitationsModule } from './core/invitations/invitations.module.js';
import { MembersModule } from './core/members/members.module.js';
import { OrganizationsModule } from './core/organizations/organizations.module.js';
import { PlatformAdminModule } from './core/platform-admin/platform-admin.module.js';
import { PlatformConfigModule } from './infra/platform-config/platform-config.module.js';
import { RbacModule } from './core/rbac/rbac.module.js';
import { RolesModule } from './core/roles/roles.module.js';
import { TenancyModule } from './core/tenancy/tenancy.module.js';
import { HealthModule } from './infra/health/health.module.js';
import { LoggingModule } from './infra/logging/logging.module.js';
import { MailWorkerModule } from './infra/mail/mail-worker.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { QueueModule } from './infra/queue/queue.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { ThrottleModule } from './infra/throttle/throttle.module.js';

@Module({})
export class AppModule {
  /** `withWorker` also runs the queue consumers in this process (APP_ROLE=all, tests). */
  static register(options: { withWorker: boolean }): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule,
        LoggingModule,
        PrismaModule,
        RedisModule,
        QueueModule,
        ThrottleModule,
        HealthModule,
        TenancyModule,
        AuditModule,
        AuthModule,
        RbacModule,
        PlatformConfigModule,
        UsersModule,
        OrganizationsModule,
        RolesModule,
        MembersModule,
        InvitationsModule,
        GroupsModule,
        AssignmentsModule,
        PlatformAdminModule,
        ActivityModule,
        NotificationsModule,
        TasksModule,
        ProgressModule,
        FilesModule,
        MessagingModule,
        FitnessModule,
        CoachingModule,
        ...(options.withWorker ? [MailWorkerModule, NotificationsWorkerModule, FitnessRemindersWorkerModule, CoachingRemindersWorkerModule] : []),
      ],
    };
  }
}
