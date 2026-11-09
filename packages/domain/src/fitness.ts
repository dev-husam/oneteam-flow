import { orgPermission, type GrantScope, type PermissionDefinition } from './permissions.js';
import type { NavItem } from './navigation.js';

/**
 * The Fitness business module: manifest (permissions, default grants, navigation, system measurements) plus the
 * pure rules for workout plans and schedules. The platform reads the manifest; nothing in core imports Fitness code.
 */
export const FITNESS_MODULE_KEY = 'fitness';

export const GOAL_TYPES = ['FAT_LOSS', 'MUSCLE_GAIN', 'STRENGTH', 'ENDURANCE', 'GENERAL_FITNESS', 'REHAB', 'OTHER'] as const;
export const ACTIVITY_LEVELS = ['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE'] as const;
export const SEXES = ['FEMALE', 'MALE', 'OTHER'] as const;
export const MUSCLE_GROUPS = ['CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'FOREARMS', 'CORE', 'QUADS', 'HAMSTRINGS', 'GLUTES', 'CALVES', 'FULL_BODY', 'CARDIO'] as const;
export const EQUIPMENT = ['BARBELL', 'DUMBBELL', 'MACHINE', 'CABLE', 'BODYWEIGHT', 'KETTLEBELL', 'BANDS', 'CARDIO_MACHINE', 'OTHER'] as const;

export type GoalType = (typeof GOAL_TYPES)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type EquipmentKind = (typeof EQUIPMENT)[number];

const fit = (code: string, group: string, description: string, scopes: readonly GrantScope[]): PermissionDefinition => ({
  ...orgPermission(code, group, description, scopes),
  moduleKey: FITNESS_MODULE_KEY,
});

export const FITNESS_PERMISSIONS: readonly PermissionDefinition[] = [
  fit('fitness.client.read', 'fitness', 'See client profiles and workout history', ['OWN', 'ASSIGNED', 'ORG']),
  fit('fitness.client.update', 'fitness', 'Edit client profiles (goals, height, health notes)', ['OWN', 'ASSIGNED', 'ORG']),
  fit('fitness.exercise.read', 'fitness', 'Browse the exercise library', ['ORG']),
  fit('fitness.exercise.manage', 'fitness', 'Add, edit and archive the organization\'s own exercises', ['ORG']),
  fit('fitness.workout_plan.manage', 'fitness', 'Create, edit, publish and archive workout plans', ['OWN', 'ORG']),
  fit('fitness.workout_plan.assign', 'fitness', 'Assign workout plans to clients', ['ASSIGNED', 'ORG']),
  fit('fitness.workout.read', 'fitness', 'See assigned workouts and logged sessions', ['OWN', 'ASSIGNED', 'ORG']),
  fit('fitness.workout.log', 'fitness', 'Log your own workout sessions', ['OWN']),
  fit('fitness.nutrition_plan.manage', 'fitness', 'Create, edit, publish and archive nutrition plans', ['OWN', 'ORG']),
  fit('fitness.nutrition_plan.assign', 'fitness', 'Assign nutrition plans to clients', ['ASSIGNED', 'ORG']),
  fit('fitness.nutrition.read', 'fitness', 'See assigned nutrition plans and meal logs', ['OWN', 'ASSIGNED', 'ORG']),
  fit('fitness.nutrition.log', 'fitness', 'Log your own meals', ['OWN']),
  fit('fitness.checkin.submit', 'fitness', 'Fill in and submit your weekly check-in', ['OWN']),
  fit('fitness.checkin.read', 'fitness', 'See weekly check-ins', ['OWN', 'ASSIGNED', 'ORG']),
  fit('fitness.checkin.review', 'fitness', 'Review check-ins and give feedback', ['ASSIGNED', 'ORG']),
  fit('fitness.photo.read', 'fitness', 'See progress photos (sensitive: every access is audited)', ['OWN', 'ASSIGNED', 'ORG']),
];

/**
 * Permissions that guard special-category data. They are granted by accountability, not by rank: owners hold them,
 * trainers for their own clients, clients for themselves; admins and managers do not by default (an owner can
 * give the permission to a custom role).
 */
export const FITNESS_SENSITIVE_PERMISSIONS: readonly string[] = ['fitness.photo.read'];

/** Default grants the module adds to the system role templates. Owners and admins receive every permission automatically. */
export const FITNESS_ROLE_DEFAULTS: Readonly<Record<string, Readonly<Record<string, GrantScope>>>> = {
  manager: {
    'fitness.client.read': 'ORG',
    'fitness.client.update': 'ORG',
    'fitness.exercise.read': 'ORG',
    'fitness.exercise.manage': 'ORG',
    'fitness.workout_plan.manage': 'ORG',
    'fitness.workout_plan.assign': 'ORG',
    'fitness.workout.read': 'ORG',
    'fitness.workout.log': 'OWN',
    'fitness.nutrition_plan.manage': 'ORG',
    'fitness.nutrition_plan.assign': 'ORG',
    'fitness.nutrition.read': 'ORG',
    'fitness.nutrition.log': 'OWN',
    'fitness.checkin.submit': 'OWN',
    'fitness.checkin.read': 'ORG',
    'fitness.checkin.review': 'ORG',
  },
  practitioner: {
    'fitness.client.read': 'ASSIGNED',
    'fitness.client.update': 'ASSIGNED',
    'fitness.exercise.read': 'ORG',
    'fitness.exercise.manage': 'ORG',
    'fitness.workout_plan.manage': 'OWN',
    'fitness.workout_plan.assign': 'ASSIGNED',
    'fitness.workout.read': 'ASSIGNED',
    'fitness.workout.log': 'OWN',
    'fitness.nutrition_plan.manage': 'OWN',
    'fitness.nutrition_plan.assign': 'ASSIGNED',
    'fitness.nutrition.read': 'ASSIGNED',
    'fitness.nutrition.log': 'OWN',
    'fitness.checkin.submit': 'OWN',
    'fitness.checkin.read': 'ASSIGNED',
    'fitness.checkin.review': 'ASSIGNED',
    'fitness.photo.read': 'ASSIGNED',
  },
  participant: {
    'fitness.client.read': 'OWN',
    'fitness.client.update': 'OWN',
    'fitness.exercise.read': 'ORG',
    'fitness.workout.read': 'OWN',
    'fitness.workout.log': 'OWN',
    'fitness.nutrition.read': 'OWN',
    'fitness.nutrition.log': 'OWN',
    'fitness.checkin.submit': 'OWN',
    'fitness.checkin.read': 'OWN',
    'fitness.photo.read': 'OWN',
  },
};

export const FITNESS_NAVIGATION: readonly NavItem[] = [
  { key: 'clients', labelKey: 'nav.clients', path: '/o/{orgSlug}/clients', requiredPermission: 'fitness.workout_plan.assign', moduleKey: FITNESS_MODULE_KEY },
  { key: 'checkins', labelKey: 'nav.checkins', path: '/o/{orgSlug}/checkins', requiredPermission: 'fitness.checkin.review', moduleKey: FITNESS_MODULE_KEY },
  { key: 'plans', labelKey: 'nav.plans', path: '/o/{orgSlug}/plans', requiredPermission: 'fitness.workout_plan.manage', moduleKey: FITNESS_MODULE_KEY },
  { key: 'nutrition-plans', labelKey: 'nav.nutritionPlans', path: '/o/{orgSlug}/nutrition-plans', requiredPermission: 'fitness.nutrition_plan.manage', moduleKey: FITNESS_MODULE_KEY },
  { key: 'exercises', labelKey: 'nav.exercises', path: '/o/{orgSlug}/exercises', requiredPermission: 'fitness.exercise.read', moduleKey: FITNESS_MODULE_KEY },
  { key: 'workouts', labelKey: 'nav.workouts', path: '/o/{orgSlug}/workouts', requiredPermission: 'fitness.workout.log', moduleKey: FITNESS_MODULE_KEY },
  { key: 'nutrition', labelKey: 'nav.nutrition', path: '/o/{orgSlug}/nutrition', requiredPermission: 'fitness.nutrition.log', moduleKey: FITNESS_MODULE_KEY },
  { key: 'checkin', labelKey: 'nav.checkin', path: '/o/{orgSlug}/checkin', requiredPermission: 'fitness.checkin.submit', moduleKey: FITNESS_MODULE_KEY },
];

/** Measurements every Fitness organization gets (system-wide definitions; organizations may still add their own). */
export const FITNESS_METRICS = [
  { key: 'weight_kg', unit: 'kg', precision: 1, higherIsBetter: null, names: { en: 'Body weight', ar: 'وزن الجسم' } },
  { key: 'body_fat_pct', unit: '%', precision: 1, higherIsBetter: null, names: { en: 'Body fat', ar: 'نسبة الدهون' } },
  { key: 'waist_cm', unit: 'cm', precision: 1, higherIsBetter: null, names: { en: 'Waist', ar: 'محيط الخصر' } },
  { key: 'hips_cm', unit: 'cm', precision: 1, higherIsBetter: null, names: { en: 'Hips', ar: 'محيط الوركين' } },
  { key: 'chest_cm', unit: 'cm', precision: 1, higherIsBetter: null, names: { en: 'Chest', ar: 'محيط الصدر' } },
  { key: 'arm_cm', unit: 'cm', precision: 1, higherIsBetter: null, names: { en: 'Arm', ar: 'محيط الذراع' } },
  { key: 'thigh_cm', unit: 'cm', precision: 1, higherIsBetter: null, names: { en: 'Thigh', ar: 'محيط الفخذ' } },
] as const;

// ---------------------------------------------------------------- workout plans

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
export interface PlanIssue {
  /** e.g. "days[0].exercises[2].repsMax" */
  path: string;
  rule: string;
}

export const PLAN_LIMITS = { maxDays: 7, maxExercisesPerDay: 30, maxSets: 20, maxReps: 100, maxWeightKg: 1000, maxRestSeconds: 1800 } as const;

const isInt = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

/**
 * Validates the content of one plan version. A draft may be incomplete (`forPublish: false`); publishing requires
 * at least one day, and every day at least one exercise. Returns every issue so the editor can mark all of them.
 */
export function validatePlanContent(days: readonly PlanDayInput[], opts: { forPublish: boolean }): PlanIssue[] {
  const issues: PlanIssue[] = [];
  if (days.length > PLAN_LIMITS.maxDays) issues.push({ path: 'days', rule: 'maxDays' });
  if (opts.forPublish && days.length === 0) issues.push({ path: 'days', rule: 'minDays' });
  days.forEach((day, d) => {
    const at = (rest: string) => `days[${d}].${rest}`;
    if (typeof day.name !== 'string' || day.name.trim().length < 1 || day.name.length > 80) issues.push({ path: at('name'), rule: 'name' });
    if (day.exercises.length > PLAN_LIMITS.maxExercisesPerDay) issues.push({ path: at('exercises'), rule: 'maxExercises' });
    if (opts.forPublish && day.exercises.length === 0) issues.push({ path: at('exercises'), rule: 'minExercises' });
    day.exercises.forEach((ex, e) => {
      const p = (field: string) => `days[${d}].exercises[${e}].${field}`;
      if (!ex.exerciseId) issues.push({ path: p('exerciseId'), rule: 'required' });
      if (!isInt(ex.sets, 1, PLAN_LIMITS.maxSets)) issues.push({ path: p('sets'), rule: 'range' });
      if (!isInt(ex.repsMin, 1, PLAN_LIMITS.maxReps)) issues.push({ path: p('repsMin'), rule: 'range' });
      if (!isInt(ex.repsMax, 1, PLAN_LIMITS.maxReps)) issues.push({ path: p('repsMax'), rule: 'range' });
      else if (isInt(ex.repsMin, 1, PLAN_LIMITS.maxReps) && ex.repsMin > ex.repsMax) issues.push({ path: p('repsMax'), rule: 'repsOrder' });
      if (ex.targetWeightKg != null && !(typeof ex.targetWeightKg === 'number' && ex.targetWeightKg >= 0 && ex.targetWeightKg <= PLAN_LIMITS.maxWeightKg && Math.round(ex.targetWeightKg * 100) / 100 === ex.targetWeightKg)) {
        issues.push({ path: p('targetWeightKg'), rule: 'range' });
      }
      if (!isInt(ex.restSeconds, 0, PLAN_LIMITS.maxRestSeconds)) issues.push({ path: p('restSeconds'), rule: 'range' });
      if (ex.tempo != null && ex.tempo.length > 20) issues.push({ path: p('tempo'), rule: 'maxLength' });
      if (ex.supersetGroup != null && !isInt(ex.supersetGroup, 1, 10)) issues.push({ path: p('supersetGroup'), rule: 'range' });
      if (ex.notes != null && ex.notes.length > 500) issues.push({ path: p('notes'), rule: 'maxLength' });
    });
  });
  return issues;
}

// ---------------------------------------------------------------- schedules (dates are plain "YYYY-MM-DD" strings)

/** Plan day number (1-based) → ISO weekday (1 = Monday … 7 = Sunday). */
export type WeeklySchedule = Record<string, number>;

/** Each plan day must exist and be placed on its own weekday. Returns the offending day keys. */
export function scheduleIssues(schedule: WeeklySchedule, dayCount: number): string[] {
  const bad: string[] = [];
  const seen = new Set<number>();
  for (const [day, weekday] of Object.entries(schedule)) {
    const n = Number(day);
    if (!Number.isInteger(n) || n < 1 || n > dayCount || !isInt(weekday, 1, 7) || seen.has(weekday)) bad.push(day);
    else seen.add(weekday);
  }
  if (Object.keys(schedule).length === 0) bad.push('schedule');
  return bad;
}

/** Today's date (YYYY-MM-DD) in an IANA time zone: "today" for a client is decided by the organization's clock, not the server's. */
export function dateInTimeZone(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a calendar date; independent of any time zone. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return js === 0 ? 7 : js;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Plan day numbers scheduled on a date. */
export function scheduledDays(schedule: WeeklySchedule, date: string): number[] {
  const weekday = isoWeekday(date);
  return Object.entries(schedule).filter(([, w]) => w === weekday).map(([day]) => Number(day)).sort((a, b) => a - b);
}

export interface AssignmentWindow {
  startDate: string;
  endDate: string | null;
  status: 'ACTIVE' | 'CANCELLED';
}
/** Is the assignment running on that date? */
export const assignmentActiveOn = (a: AssignmentWindow, date: string): boolean =>
  a.status === 'ACTIVE' && date >= a.startDate && (a.endDate === null || date <= a.endDate);

// ---------------------------------------------------------------- session maths

export interface LoggedSet {
  repsDone: number;
  weightKg: number | null;
}
/** Total load moved: Σ reps × weight over sets that have a weight. */
export const sessionVolume = (sets: readonly LoggedSet[]): number =>
  Math.round(sets.reduce((sum, s) => sum + (s.weightKg === null ? 0 : s.repsDone * s.weightKg), 0) * 100) / 100;

/** Epley estimate of a one-rep max; only meaningful for 1–12 reps, otherwise null. */
export function estimatedOneRepMax(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}
