/** Response shapes of the REST API (hand-written for now; replaced by OpenAPI generation later). */
export type ClientType = 'web' | 'ios' | 'android';
export type Locale = 'en' | 'ar';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION';
  emailVerified: boolean;
  phoneVerified: boolean;
  locale: Locale;
  timezone: string;
  unitSystem: 'METRIC' | 'IMPERIAL';
  mfaEnabled: boolean;
  createdAt: string;
}

export interface AuthSession {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  sessionId: string;
  /** Present for native clients only; web receives it as an HttpOnly cookie. */
  refreshToken?: string;
  user: User;
}

export interface SessionInfo {
  id: string;
  clientType: 'WEB' | 'IOS' | 'ANDROID';
  deviceName: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  locale?: Locale;
  acceptTerms: boolean;
}

export interface UpdateProfileInput {
  fullName?: string;
  phone?: string | null;
  locale?: Locale;
  timezone?: string;
  unitSystem?: 'METRIC' | 'IMPERIAL';
}

// ---------------------------------------------------------------- Phase 2/3: tenancy, RBAC, platform

export type GrantScope = 'OWN' | 'ASSIGNED' | 'ORG' | 'ALL';
export interface Page<T> {
  data: T[];
  meta: { nextCursor: string | null };
}

export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}
export type LoginResult = AuthSession | MfaChallenge;
export const isMfaChallenge = (r: LoginResult): r is MfaChallenge => 'mfaRequired' in r;

export interface MfaEnrollment {
  secret: string;
  otpauthUri: string;
  issuer: string;
  account: string;
}

export interface PlatformAccess {
  isPlatformStaff: boolean;
  roles: string[];
}

export interface RoleRef {
  id: string;
  key: string;
  name: string;
  rank: number;
  /** i18n key like role.practitioner.trainer (system roles). Custom roles show `name`. */
  labelKey: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  categoryKey: string;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  timezone: string;
  defaultLocale: Locale;
  weekStartsOn: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  createdAt: string;
}

export interface MyOrganization {
  organization: Organization;
  membershipId: string;
  role: RoleRef;
}

export interface CategoryOption {
  key: string;
  name: Record<Locale, string>;
}

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  categoryKey: string;
  timezone?: string;
  defaultLocale?: Locale;
  description?: string;
}

export type UpdateOrganizationInput = Partial<
  Pick<Organization, 'name' | 'description' | 'contactEmail' | 'contactPhone' | 'timezone' | 'defaultLocale' | 'weekStartsOn'>
>;

export interface NavItem {
  key: string;
  labelKey: string;
  path: string;
  requiredPermission?: string;
  moduleKey?: string;
}

export interface OrgContext {
  organization: Organization;
  membership: { id: string; role: RoleRef };
  permissions: { code: string; scope: GrantScope }[];
  enabledModules: string[];
  /** Every feature flag as this organization sees it, so clients hide controls that would only fail. */
  features: Record<string, boolean>;
  /** The organization's own design, when it uses another than the platform default; otherwise null. */
  design: DesignTheme | null;
  navigation: NavItem[];
}

export type MemberStatus = 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
export interface Member {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  status: MemberStatus;
  joinedAt: string;
  role: RoleRef;
}

export interface ListMembersParams {
  q?: string;
  roleId?: string;
  status?: MemberStatus;
  cursor?: string;
  limit?: number;
}

export interface Invitation {
  id: string;
  email: string;
  phone: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  roleId: string;
  invitedByMembershipId: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
}

export interface CreateInvitationInput {
  email: string;
  roleId: string;
  fullName?: string;
  phone?: string;
  assignToMembershipId?: string;
  groupIds?: string[];
}

export interface InvitationPreview {
  email: string;
  fullName: string | null;
  organization: { name: string; slug: string };
  role: { name: string; labelKey: string };
  invitedBy: string;
  expiresAt: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  typeKey: string | null;
  createdByMembershipId: string;
  archived: boolean;
  memberCount: number;
  createdAt: string;
}
export interface GroupDetail extends Group {
  members: { membershipId: string; fullName: string; roleKey: string; addedAt: string }[];
}

export interface Assignment {
  id: string;
  practitionerMembershipId: string;
  participantMembershipId: string;
  practitionerName: string;
  participantName: string;
  kind: 'PRIMARY' | 'SECONDARY';
  startedAt: string;
  endedAt: string | null;
  createdByMembershipId: string;
}

export interface Grant {
  code: string;
  scope: Exclude<GrantScope, 'ALL'>;
}
export interface RoleDetail {
  id: string;
  key: string;
  name: string;
  rank: number;
  isSystem: boolean;
  memberCount: number;
  grants: Grant[];
  /** The caller may hand this role out (rank and permissions). */
  assignable: boolean;
}
export interface AssignableRole {
  id: string;
  key: string;
  name: string;
  rank: number;
  isSystem: boolean;
  labelKey: string | null;
}
export interface PermissionDefinition {
  code: string;
  group: string;
  moduleKey: string | null;
  description: string;
  allowedScopes: GrantScope[];
}
export interface RoleInput {
  name: string;
  rank: number;
  grants?: Grant[];
  templateRoleId?: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actorUserId: string | null;
  actorName?: string | null;
  actorType: 'USER' | 'SUPER_ADMIN' | 'SYSTEM';
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  organizationId?: string | null;
  createdAt: string;
}

// ---- platform administration

export interface AdminStats {
  users: { total: number; suspended: number; new7d: number; new30d: number };
  organizations: Record<string, number>;
  organizationsByCategory: Record<string, number>;
  activeMemberships: number;
}
export interface AdminHealth {
  status: 'ok' | 'degraded';
  checks: { mysql: 'up' | 'down'; redis: 'up' | 'down' };
  queues: { email: { waiting: number; active: number; delayed: number; failed: number } | null };
  process: { uptimeSeconds: number; rssMb: number };
}
export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  status: User['status'];
  emailVerifiedAt: string | null;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
export interface AdminUserDetail extends AdminUser {
  phone: string | null;
  memberships: { id: string; status: MemberStatus; organization: { id: string; name: string; slug: string }; role: { key: string } }[];
  platformRoles: string[];
}
export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  status: Organization['status'];
  categoryKey: string;
  memberCount: number;
  createdAt: string;
}
export interface AdminOrganizationDetail {
  id: string;
  name: string;
  slug: string;
  status: Organization['status'];
  timezone: string;
  defaultLocale: string;
  createdAt: string;
  createdByUserId: string;
  categoryKey: string;
  modules: { enabled: boolean; module: { key: string; status: 'ENABLED' | 'DISABLED' } }[];
  memberships: Record<string, number>;
  _count: { memberships: number; invitations: number; groups: number };
}
export interface CatalogEntry {
  key: string;
  nameI18n: Record<Locale, string>;
  status: 'ENABLED' | 'DISABLED';
  sortOrder?: number;
  _count: { organizations: number };
}
export interface PlatformRoleInfo {
  key: string;
  permissions: string[];
  holders: { id: string; email: string; fullName: string; grantedAt: string }[];
}

// ---- shared capabilities (Phase 5)

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type AssigneeStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE';

export interface TaskAssignee {
  membershipId: string;
  fullName: string;
  status: AssigneeStatus;
  completedAt: string | null;
}
export interface Task {
  id: string;
  typeKey: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: string | null;
  completedAt: string | null;
  /** Optimistic-concurrency token: send it back with every update. */
  version: number;
  createdAt: string;
  createdByMembershipId: string;
  createdByName: string;
  /** The caller's own status when they are an assignee. */
  myStatus: AssigneeStatus | null;
  assignees: TaskAssignee[];
  commentCount: number;
  attachmentCount: number;
}
export interface TaskAttachment {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}
export interface TaskDetail extends Task {
  attachments: TaskAttachment[];
}
export interface TaskComment {
  id: string;
  authorMembershipId: string;
  authorName: string;
  body: string;
  edited: boolean;
  createdAt: string;
}
export interface ActivityItem {
  id: string;
  verb: string;
  actorMembershipId: string | null;
  actorName: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}
export interface ActivityFeedItem {
  id: string;
  verb: string;
  entityType: string;
  entityId: string;
  actorName: string | null;
  subjectMembershipId: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}
export interface ListTasksParams {
  status?: TaskStatus;
  priority?: TaskPriority;
  /** Membership id, or "me". */
  assignee?: string;
  q?: string;
  overdue?: boolean;
  cursor?: string;
  limit?: number;
}
export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueAt?: string;
  assigneeMembershipIds?: string[];
  groupIds?: string[];
}
export interface UpdateTaskInput {
  version: number;
  title?: string;
  description?: string;
  priority?: TaskPriority;
  /** null removes the due date. */
  dueAt?: string | null;
  status?: 'OPEN' | 'CANCELLED';
}

export type FileSensitivity = 'STANDARD' | 'SENSITIVE';
export interface StoredFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sensitivity: FileSensitivity;
  status: 'PENDING_UPLOAD' | 'READY' | 'REJECTED';
  rejectReason: string | null;
  createdAt: string;
  mine: boolean;
}
export interface UploadTarget {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
}
export interface UploadInput {
  fileName: string;
  mimeType: string;
  /** A Blob/File on web and from fetch(uri).blob() on React Native. */
  body: Blob;
  sensitivity?: FileSensitivity;
}

export interface MetricDefinition {
  id: string;
  key: string;
  name: string;
  unit: string;
  precision: number;
  higherIsBetter: boolean | null;
  moduleKey: string | null;
  /** Built-in metric (cannot be edited). */
  system: boolean;
}
export interface MetricPoint {
  id: string;
  metricId: string;
  value: number;
  recordedAt: string;
  recordedByName: string;
  sourceType: string;
}
/** Mirrors `summarizeSeries` in @pt/domain (the server computes it; clients only display it). */
export interface SeriesSummary {
  count: number;
  first: { value: number; at: string } | null;
  latest: { value: number; at: string } | null;
  min: number | null;
  max: number | null;
  /** latest − first; null with fewer than two entries. */
  change: number | null;
  /** change as a share of the first value (-0.05 = -5 %). */
  changeRatio: number | null;
  /** Whether the change moved in the metric's good direction; null when unknown or unchanged. */
  improved: boolean | null;
}
export interface MetricSummary {
  metric: MetricDefinition;
  points: MetricPoint[];
  summary: SeriesSummary;
}
export interface Milestone {
  id: string;
  title: string;
  targetValue: number | null;
  dueDate: string | null;
  achievedAt: string | null;
}
export interface Goal {
  id: string;
  subjectMembershipId: string;
  metricId: string | null;
  title: string;
  description: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  direction: 'INCREASE' | 'DECREASE' | null;
  dueDate: string | null;
  status: 'ACTIVE' | 'ACHIEVED' | 'ABANDONED';
  achievedAt: string | null;
  currentValue: number | null;
  /** 0..1, null for goals without a numeric target. */
  progress: number | null;
  milestones: Milestone[];
}
export interface GroupProgress {
  metric: MetricDefinition;
  members: { membershipId: string; fullName: string; latest: number | null; at: string | null }[];
  aggregate: { visibleMembers: number; withData: number; average: number | null; min: number | null; max: number | null };
}
export interface CreateGoalInput {
  subjectMembershipId: string;
  metricId?: string;
  title: string;
  description?: string;
  baselineValue?: number;
  targetValue?: number;
  dueDate?: string;
}

export type NotificationCategory = 'tasks' | 'progress' | 'fitness';
export type NotificationChannel = 'IN_APP' | 'PUSH' | 'EMAIL';
export interface AppNotification {
  id: string;
  typeKey: string;
  organizationId: string | null;
  /** Deep-link data, e.g. { orgSlug, taskId }. */
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  /** Already rendered in the recipient's language. */
  title: string;
  body: string;
}
export interface NotificationPreference {
  category: NotificationCategory;
  channels: Record<NotificationChannel, boolean>;
}

// ---- Fitness module (Phase 6a)

export type MuscleGroupKey = 'CHEST' | 'BACK' | 'SHOULDERS' | 'BICEPS' | 'TRICEPS' | 'FOREARMS' | 'CORE' | 'QUADS' | 'HAMSTRINGS' | 'GLUTES' | 'CALVES' | 'FULL_BODY' | 'CARDIO';
export type EquipmentKey = 'BARBELL' | 'DUMBBELL' | 'MACHINE' | 'CABLE' | 'BODYWEIGHT' | 'KETTLEBELL' | 'BANDS' | 'CARDIO_MACHINE' | 'OTHER';
export type GoalTypeKey = 'FAT_LOSS' | 'MUSCLE_GAIN' | 'STRENGTH' | 'ENDURANCE' | 'GENERAL_FITNESS' | 'REHAB' | 'OTHER';
export type ActivityLevelKey = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';

export interface Exercise {
  id: string;
  /** Stable key of seeded exercises; null for the organization's own. */
  key: string | null;
  name: { en: string; ar: string | null };
  muscleGroup: MuscleGroupKey;
  equipment: EquipmentKey;
  instructions: { en?: string; ar?: string } | null;
  videoUrl: string | null;
  system: boolean;
  archived: boolean;
}
export interface CreateExerciseInput {
  name: string;
  nameAr?: string;
  muscleGroup: MuscleGroupKey;
  equipment: EquipmentKey;
  instructions?: string;
  instructionsAr?: string;
  videoUrl?: string;
}

export interface ActivePlanRef {
  assignmentId: string;
  planId: string;
  planName: string;
}
export interface ClientSummary {
  membershipId: string;
  fullName: string;
  email: string;
  goalType: GoalTypeKey | null;
  heightCm: number | null;
  activePlans: ActivePlanRef[];
  lastSessionAt: string | null;
  /** Where the client stands with their weekly check-in. */
  checkin: CheckinDueStateKey;
}
export interface ClientProfile {
  dateOfBirth: string | null;
  sex: 'FEMALE' | 'MALE' | 'OTHER' | null;
  heightCm: number | null;
  goalType: GoalTypeKey | null;
  goalsText: string | null;
  activityLevel: ActivityLevelKey | null;
  /** Health notes, decrypted by the server for people allowed to read the client. */
  injuriesNotes: string | null;
  updatedAt: string;
}
export interface ClientDetail {
  membershipId: string;
  fullName: string;
  email: string;
  profile: ClientProfile | null;
  startingWeightKg: number | null;
  stats: { completedLast30Days: number; lastSessionAt: string | null };
  activePlans: (ActivePlanRef & { versionNo: number; startDate: string; endDate: string | null })[];
}
/** Absent = unchanged, null = cleared. */
export interface UpdateClientProfileInput {
  dateOfBirth?: string | null;
  sex?: 'FEMALE' | 'MALE' | 'OTHER' | null;
  heightCm?: number | null;
  goalType?: GoalTypeKey | null;
  goalsText?: string | null;
  activityLevel?: ActivityLevelKey | null;
  injuriesNotes?: string | null;
  startingWeightKg?: number;
}

export interface PlanExerciseInput {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  targetWeightKg?: number | null;
  restSeconds: number;
  tempo?: string | null;
  supersetGroup?: number | null;
  notes?: string | null;
}
export interface PlanDayInput {
  name: string;
  notes?: string | null;
  exercises: PlanExerciseInput[];
}
export interface PlanContentInput {
  notes?: string | null;
  days: PlanDayInput[];
}
export interface PlanVersionRef {
  id: string;
  versionNo: number;
  publishedAt: string | null;
  dayCount: number;
}
export interface PlanSummary {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  createdByName: string;
  updatedAt: string;
  currentVersion: PlanVersionRef | null;
  hasDraft: boolean;
  activeAssignments: number;
}
export interface PlanDetail {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  createdByMembershipId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  currentVersion: PlanVersionRef | null;
  draftVersionId: string | null;
  versions: { id: string; versionNo: number; publishedAt: string | null; notes: string | null; dayCount: number; assignmentCount: number }[];
}
export interface PlanDayExercise {
  id: string;
  position: number;
  exerciseId: string;
  exercise: Exercise;
  sets: number;
  repsMin: number;
  repsMax: number;
  targetWeightKg: number | null;
  restSeconds: number;
  tempo: string | null;
  supersetGroup: number | null;
  notes: string | null;
}
export interface PlanDay {
  id: string;
  dayIndex: number;
  name: string;
  notes: string | null;
  exercises: PlanDayExercise[];
}
export interface PlanVersion {
  id: string;
  planId: string;
  versionNo: number;
  publishedAt: string | null;
  published: boolean;
  notes: string | null;
  days: PlanDay[];
}

/** Plan day number → ISO weekday (1 = Monday … 7 = Sunday). */
export type WeeklyScheduleMap = Record<string, number>;
export interface CreateAssignmentsInput {
  versionId?: string;
  clientMembershipIds?: string[];
  groupIds?: string[];
  startDate: string;
  endDate?: string;
  weeklySchedule: WeeklyScheduleMap;
}
export interface AssignmentItem {
  id: string;
  planId: string;
  planName: string;
  versionId: string;
  versionNo: number;
  clientMembershipId: string;
  clientName: string;
  assignedByName: string;
  startDate: string;
  endDate: string | null;
  weeklySchedule: WeeklyScheduleMap;
  status: 'ACTIVE' | 'CANCELLED';
  /** Derived from the dates and the organization's clock. */
  state: 'ACTIVE' | 'UPCOMING' | 'ENDED' | 'CANCELLED';
  batchId: string | null;
  completedSessions: number;
  createdAt: string;
}
export interface AssignmentDetail extends AssignmentItem {
  content: PlanVersion;
  sessions: { id: string; scheduledDate: string; dayId: string; dayName: string; completedAt: string | null; rpe: number | null }[];
}

export interface TodayItem {
  assignmentId: string;
  planName: string;
  dayId: string;
  dayIndex: number;
  dayName: string;
  exerciseCount: number;
}
export interface TodayView {
  /** Today in the organization's time zone (YYYY-MM-DD). */
  date: string;
  timezone: string;
  today: (TodayItem & { session: { id: string; startedAt: string | null; completedAt: string | null } | null })[];
  upcoming: { date: string; items: TodayItem[] }[];
  /** Every plan day the client may also do at any time. */
  assignments: { assignmentId: string; planId: string; planName: string; versionNo: number; startDate: string; endDate: string | null; days: { dayId: string; dayIndex: number; name: string; exerciseCount: number }[] }[];
}
export interface LoggedSetInfo {
  setNo: number;
  repsDone: number;
  weightKg: number | null;
}
export interface SessionExercise {
  dayExerciseId: string;
  position: number;
  exercise: Exercise;
  sets: number;
  repsMin: number;
  repsMax: number;
  targetWeightKg: number | null;
  restSeconds: number;
  tempo: string | null;
  supersetGroup: number | null;
  notes: string | null;
  logged: LoggedSetInfo[];
  /** What the client did the last time they performed this exercise. */
  previous: { date: string; sets: LoggedSetInfo[] } | null;
}
export interface SessionDetail {
  id: string;
  assignmentId: string;
  planId: string;
  planName: string;
  versionNo: number;
  dayId: string;
  dayName: string;
  dayNotes: string | null;
  clientMembershipId: string;
  clientName: string;
  scheduledDate: string;
  startedAt: string | null;
  completedAt: string | null;
  rpe: number | null;
  notes: string | null;
  /** Σ reps × weight. */
  volume: number;
  /** True for the client while the session is not finished. */
  editable: boolean;
  exercises: SessionExercise[];
}
export interface SessionSummary {
  id: string;
  scheduledDate: string;
  dayName: string;
  planName: string;
  startedAt: string | null;
  completedAt: string | null;
  rpe: number | null;
  setCount: number;
  volume: number;
}

// ---- Fitness: nutrition and check-ins (Phase 6b)

export type MealTypeKey = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
export type MealLogStatusKey = 'COMPLETED' | 'PARTIAL' | 'SKIPPED';
export type CheckinStatusKey = 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
export type CheckinDueStateKey = 'SUBMITTED' | 'REVIEWED' | 'DUE' | 'OVERDUE' | 'NONE';
export type PhotoAngleKey = 'FRONT' | 'SIDE' | 'BACK';
export type PhotoKindKey = 'STARTING' | 'WEEKLY' | 'OTHER';
export type CheckinMetricKey = 'weight_kg' | 'body_fat_pct' | 'waist_cm' | 'hips_cm' | 'chest_cm' | 'arm_cm' | 'thigh_cm';

export interface Macros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}
export interface MealItemInput {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  notes?: string | null;
}
export interface MealInput {
  mealType: MealTypeKey;
  /** "HH:MM" */
  timeOfDay?: string | null;
  notes?: string | null;
  items: MealItemInput[];
}
export interface NutritionDayInput {
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  notes?: string | null;
  meals: MealInput[];
}
export interface NutritionContentInput {
  notes?: string | null;
  days: NutritionDayInput[];
}
export interface MealItem {
  id: string;
  position: number;
  name: string;
  quantity: number | null;
  unit: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  notes: string | null;
}
export interface Meal {
  id: string;
  mealType: MealTypeKey;
  position: number;
  timeOfDay: string | null;
  notes: string | null;
  items: MealItem[];
  totals: Macros;
}
export interface NutritionDay {
  id: string;
  weekday: number;
  notes: string | null;
  meals: Meal[];
  totals: Macros;
}
export interface NutritionVersion {
  id: string;
  planId: string;
  versionNo: number;
  publishedAt: string | null;
  published: boolean;
  notes: string | null;
  days: NutritionDay[];
}
export interface NutritionAssignmentItem {
  id: string;
  planId: string;
  planName: string;
  versionId: string;
  versionNo: number;
  clientMembershipId: string;
  clientName: string;
  assignedByName: string;
  startDate: string;
  endDate: string | null;
  status: 'ACTIVE' | 'CANCELLED';
  state: 'ACTIVE' | 'UPCOMING' | 'ENDED' | 'CANCELLED';
  batchId: string | null;
  createdAt: string;
}
export interface NutritionAssignmentDetail extends NutritionAssignmentItem {
  content: NutritionVersion;
}
export interface MealLog {
  id: string;
  assignmentId: string;
  mealId: string;
  logDate: string;
  status: MealLogStatusKey;
  notes: string | null;
  photoFileIds: string[];
}
export interface NutritionToday {
  date: string;
  today: string;
  items: {
    assignmentId: string;
    planName: string;
    versionNo: number;
    dayNotes: string | null;
    meals: { mealId: string; mealType: MealTypeKey; timeOfDay: string | null; notes: string | null; items: Omit<MealItem, 'position'>[]; totals: Macros; log: MealLog | null }[];
  }[];
  adherencePct: number | null;
}
export interface NutritionAdherence {
  planned: number;
  logged: number;
  pct: number | null;
  perDay: { date: string; planned: number; pct: number | null }[];
}
export interface MealLogRange {
  adherence: NutritionAdherence;
  logs: (MealLog & { mealType: MealTypeKey; timeOfDay: string | null; planName: string })[];
}

export interface CheckinMeasurement {
  key: string;
  value: number;
  unit?: string;
}
export interface CheckinPhoto {
  id: string;
  /** The image is a sensitive file: fetch it with `files.downloadUrl(fileId)` (audited). */
  fileId: string;
  angle: PhotoAngleKey;
  kind: PhotoKindKey;
  takenOn: string;
}
export interface Checkin {
  id: string;
  clientMembershipId: string;
  clientName: string;
  week: { start: string; end: string };
  status: CheckinStatusKey;
  clientNotes: string | null;
  submittedAt: string | null;
  adherence: { workoutPct: number | null; nutritionPct: number | null };
  measurements: CheckinMeasurement[];
  /** True when the caller may not see photos (they are special-category data). */
  photosHidden: boolean;
  photos: CheckinPhoto[];
  reviewedByName: string | null;
  reviewedAt: string | null;
  feedback: string | null;
  comments: { id: string; authorMembershipId: string; authorName: string; body: string; createdAt: string }[];
}
export interface CheckinSummary {
  id: string;
  clientMembershipId: string;
  clientName: string;
  weekStart: string;
  status: CheckinStatusKey;
  submittedAt: string | null;
  workoutAdherencePct: number | null;
  nutritionAdherencePct: number | null;
  weightKg: number | null;
  photoCount: number;
  reviewedAt: string | null;
}
export interface CheckinWeek {
  week: { key: 'current' | 'previous'; start: string; end: string };
  today: string;
  state: CheckinDueStateKey;
  checkin: Checkin | null;
  preview: { workout: { scheduled: number; completed: number; pct: number | null }; nutrition: { planned: number; logged: number; pct: number | null } };
  lastMeasurements: Partial<Record<string, { value: number; at: string }>>;
}
export interface SaveCheckinInput {
  clientNotes?: string | null;
  /** Measurement key → value; null removes a value. */
  measurements?: Partial<Record<CheckinMetricKey, number | null>>;
}
export interface CheckinComparison {
  from: Checkin;
  to: Checkin;
  changes: { key: string; unit: string | null; from: number | null; to: number | null; change: number | null }[];
}
export interface ProgressPhoto {
  id: string;
  fileId: string;
  kind: PhotoKindKey;
  angle: PhotoAngleKey;
  takenOn: string;
  checkinId: string | null;
  weekStart: string | null;
}

// ---------------------------------------------------------------- messaging (Phase 7)

export interface MessageAttachmentInfo {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}
export interface Message {
  id: string;
  conversationId: string;
  senderMembershipId: string;
  senderName: string;
  kind: string;
  /** Empty when the message was deleted. */
  body: string;
  deleted: boolean;
  createdAt: string;
  attachments: MessageAttachmentInfo[];
}
export interface Conversation {
  id: string;
  type: 'DIRECT';
  other: { membershipId: string; fullName: string; roleKey: string; active: boolean } | null;
  lastMessage: { id: string; senderMembershipId: string; preview: string; deleted: boolean; hasAttachments: boolean; createdAt: string } | null;
  unreadCount: number;
  muted: boolean;
  /** You blocked the other person: they cannot send, and you are not offered each other as contacts. */
  blockedByMe: boolean;
  /** False when either of you blocked the other: turn the composer off. */
  canSend: boolean;
  lastMessageAt: string | null;
  createdAt: string;
}
export interface MessagingContact {
  membershipId: string;
  fullName: string;
  roleKey: string;
  /** The conversation that already exists with this person, if any. */
  conversationId: string | null;
}

/** What the server pushes over the realtime connection. */
export type RealtimeEvent =
  | { type: 'message:new'; organizationId: string; conversationId: string; message: Message }
  | { type: 'message:deleted'; organizationId: string; conversationId: string; messageId: string }
  | { type: 'conversation:read'; organizationId: string; conversationId: string; membershipId: string; messageId: string };
export type RealtimeStatus = 'connecting' | 'live' | 'offline';

export type ReportReasonKey = 'HARASSMENT' | 'SPAM' | 'INAPPROPRIATE' | 'OTHER';
export type ReportStatusKey = 'OPEN' | 'DISMISSED' | 'ACTIONED';
/** A reported message as the people who moderate see it: the message itself (a snapshot), nothing else of the conversation. */
export interface MessageReport {
  id: string;
  status: ReportStatusKey;
  reason: ReportReasonKey;
  note: string | null;
  createdAt: string;
  reporter: { membershipId: string; fullName: string };
  reported: { membershipId: string; fullName: string };
  snapshot: { body: string; attachments: { fileName: string; mimeType: string }[] };
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}


// ---- Phase 7b: admin control center
import type { DesignDefinition, DesignIssue, DesignTheme, IdentitySettings, MailBrandSettings, MailTemplateText, PublicConfig } from '@pt/domain';
export type { DesignDefinition, DesignIssue, DesignTheme, IdentitySettings, MailBrandSettings, MailTemplateText, PublicConfig };

export interface AdminFeatureFlag {
  key: string;
  scope: 'PLATFORM' | 'ORGANIZATION';
  group: string;
  description: string;
  defaultEnabled: boolean;
  enabled: boolean;
  overrideCount: number;
}
export interface AdminOrgFeatureFlag {
  key: string;
  group: string;
  description: string;
  platformEnabled: boolean;
  /** null = follows the platform value. */
  override: boolean | null;
  effective: boolean;
}
export interface AdminSettings {
  identity: IdentitySettings;
  mail: MailBrandSettings;
  logo: { mimeType: string; sizeBytes: number; updatedAt: string; url: string } | null;
}
export interface AdminEmailTemplateRow {
  key: string;
  locale: 'en' | 'ar';
  customized: boolean;
  subject: string;
}
export interface AdminEmailTemplate {
  key: string;
  locale: 'en' | 'ar';
  placeholders: string[];
  hasButton: boolean;
  default: MailTemplateText;
  custom: MailTemplateText | null;
}
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}


// ---- Phase 8a: Coaching
import type { AssessmentAnswers, AssessmentQuestion, NoteVisibility, SessionStatus, TrendSeries } from '@pt/domain';
export type { AssessmentAnswers, AssessmentQuestion, NoteVisibility, SessionStatus, TrendSeries };

export interface CoachSession {
  id: string;
  coachMembershipId: string;
  coachName: string;
  clientMembershipId: string;
  clientName: string;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
  agenda: string | null;
  status: SessionStatus;
  cancelReason: string | null;
  createdAt: string;
}
export interface CoachNote {
  id: string;
  clientMembershipId: string;
  sessionId: string | null;
  visibility: NoteVisibility;
  body: string;
  authorMembershipId: string;
  authorName: string;
  /** Written by the person asking: only they can edit or delete it. */
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface AssessmentTemplate {
  id: string;
  name: string;
  description: string | null;
  questions: AssessmentQuestion[];
  createdByMembershipId: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CoachAssessment {
  id: string;
  templateId: string;
  clientMembershipId: string;
  clientName: string;
  requestedByMembershipId: string;
  requestedByName: string;
  title: string;
  questions: AssessmentQuestion[];
  answers: AssessmentAnswers | null;
  status: 'REQUESTED' | 'COMPLETED' | 'CANCELLED';
  cadenceDays: number | null;
  dueAt: string | null;
  requestedAt: string;
  completedAt: string | null;
}
export interface CoachResource {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  clientMembershipId: string | null;
  sharedWithAll: boolean;
  createdByMembershipId: string;
  createdByName: string;
  createdAt: string;
  file: { fileId: string; fileName: string; mimeType: string; sizeBytes: number } | null;
}
export interface CreateSessionInput {
  clientMembershipId: string;
  startsAt: string;
  durationMinutes: number;
  location?: string;
  agenda?: string;
}

export interface AdminDesign extends DesignTheme {
  builtIn: boolean;
  isDefault: boolean;
  organizationCount: number;
  /** Offered to people as a personal choice (Profile → Appearance). */
  userSelectable: boolean;
  /** How many people picked it. */
  userCount: number;
  updatedAt: string;
  /** Non-blocking accessibility notes (graphics below 3:1). */
  warnings: DesignIssue[];
}
export type DesignPatch = {
  name?: string;
  description?: string;
  radius?: DesignDefinition['radius'];
  font?: DesignDefinition['font'];
  userSelectable?: boolean;
  light?: Partial<DesignDefinition['light']>;
  dark?: Partial<DesignDefinition['dark']>;
};

/** What a person has chosen for themselves. `design` is null when they follow the organization's or the platform's design. */
export interface MyDesign {
  /** False when personal choice is switched off platform-wide. */
  enabled: boolean;
  selectedKey: string | null;
  design: DesignTheme | null;
}
export interface MyDesignOptions extends MyDesign {
  designs: (DesignTheme & { builtIn: boolean })[];
  platformDefaultKey: string;
}
