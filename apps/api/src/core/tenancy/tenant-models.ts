import { Prisma } from '../../generated/prisma/client.js';

/**
 * Classification of every Prisma model. A unit test fails when a model is missing or listed twice, so a new
 * table cannot ship without an explicit tenancy decision.
 *
 * TENANT   – rows belong to one organization (organization_id NOT NULL). Reachable ONLY through the
 *            tenant-scoped client, which injects the organization on every operation.
 * ROOT     – the organization row itself (scoped by its own id).
 * MIXED    – rows may be platform-wide (organization_id NULL) or tenant-owned; accessed through reviewed
 *            services with explicit organization filters (roles, audit log, consent records).
 * GLOBAL   – not organization data (users, sessions, catalogs, MFA…); never reachable through the scoped client.
 */
export const TENANT_MODELS = [
  'OrganizationModule', 'Membership', 'Invitation', 'Group', 'GroupMember', 'MemberAssignment',
  'Task', 'TaskAssignment', 'TaskComment', 'TaskAttachment', 'File', 'MetricRecord', 'Goal', 'GoalMilestone', 'ActivityEvent',
  'FitClientProfile', 'FitWorkoutPlan', 'FitWorkoutPlanVersion', 'FitWorkoutDay', 'FitWorkoutDayExercise',
  'FitWorkoutAssignment', 'FitWorkoutSession', 'FitWorkoutSetLog',
  'FitNutritionPlan', 'FitNutritionPlanVersion', 'FitNutritionDay', 'FitMeal', 'FitMealItem', 'FitNutritionAssignment', 'FitMealLog', 'FitMealLogPhoto',
  'FitCheckin', 'FitCheckinComment', 'FitProgressPhoto', 'FitReminderMark',
  'Conversation', 'ConversationParticipant', 'Message', 'MessageAttachment', 'MessageBlock', 'MessageReport',
  'CoachSession', 'CoachNote', 'CoachAssessmentTemplate', 'CoachAssessment', 'CoachResource',
] as const;
export const ROOT_MODELS = ['Organization'] as const;
export const MIXED_MODELS = ['Role', 'AuditLog', 'ConsentRecord', 'MetricDefinition', 'FitExercise', 'OrganizationFeatureOverride', 'OrganizationDesign'] as const;
export const GLOBAL_MODELS = [
  'User',
  'UserSession',
  'RefreshToken',
  'OneTimeToken',
  'BusinessCategory',
  'PlatformModule',
  'CategoryModule',
  'Permission',
  'RolePermission',
  'PlatformRoleAssignment',
  'MfaFactor',
  'MfaRecoveryCode',
  'PushDevice',
  'Notification',
  'NotificationPreference',
  'FeatureFlag',
  'PlatformSetting',
  'PlatformAsset',
  'EmailTemplate',
  'DesignTheme',
] as const;

export const ALL_CLASSIFIED: readonly string[] = [...TENANT_MODELS, ...ROOT_MODELS, ...MIXED_MODELS, ...GLOBAL_MODELS];
export const ALL_PRISMA_MODELS: readonly string[] = Object.values(Prisma.ModelName);
