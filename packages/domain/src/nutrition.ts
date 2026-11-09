import { addDays, isoWeekday, type PlanIssue } from './fitness.js';

/**
 * Pure rules for nutrition plans, meal-log adherence, check-in weeks and check-in status (Fitness module, 6b).
 * Dates are plain "YYYY-MM-DD" strings in the organization's time zone.
 */
export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
export const MEAL_LOG_STATUSES = ['COMPLETED', 'PARTIAL', 'SKIPPED'] as const;
export const CHECKIN_STATUSES = ['DRAFT', 'SUBMITTED', 'REVIEWED'] as const;
export const PHOTO_ANGLES = ['FRONT', 'SIDE', 'BACK'] as const;
export const PHOTO_KINDS = ['STARTING', 'WEEKLY', 'OTHER'] as const;
/** Measurements a check-in may carry (registered by the Fitness module; values are stored as measurements). */
export const CHECKIN_METRIC_KEYS = ['weight_kg', 'body_fat_pct', 'waist_cm', 'hips_cm', 'chest_cm', 'arm_cm', 'thigh_cm'] as const;

/** Plausible ranges for check-in measurements (same unit as the measurement definitions). */
export const CHECKIN_METRIC_RANGES: Record<(typeof CHECKIN_METRIC_KEYS)[number], readonly [number, number]> = {
  weight_kg: [20, 500], body_fat_pct: [2, 70], waist_cm: [30, 300], hips_cm: [30, 300], chest_cm: [30, 300], arm_cm: [10, 100], thigh_cm: [20, 150],
};

export type MealType = (typeof MEAL_TYPES)[number];
export type MealLogStatus = (typeof MEAL_LOG_STATUSES)[number];
export type CheckinStatus = (typeof CHECKIN_STATUSES)[number];

// ---------------------------------------------------------------- nutrition plan content

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
  mealType: MealType;
  /** "HH:MM" local time, optional. */
  timeOfDay?: string | null;
  notes?: string | null;
  items: MealItemInput[];
}
export interface NutritionDayInput {
  /** ISO weekday 1 (Monday) – 7 (Sunday). Weekdays without a day are free days. */
  weekday: number;
  notes?: string | null;
  meals: MealInput[];
}

export const NUTRITION_LIMITS = { maxMealsPerDay: 8, maxItemsPerMeal: 30, maxCalories: 10_000, maxGrams: 2_000, maxQuantity: 100_000 } as const;

const isNum = (n: unknown, min: number, max: number, decimals = 1): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max && Math.round(n * 10 ** decimals) / 10 ** decimals === n;

/** Validates one nutrition plan version. Drafts may be incomplete; publishing needs a day with a meal that has an item. */
export function validateNutritionContent(days: readonly NutritionDayInput[], opts: { forPublish: boolean }): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const seen = new Set<number>();
  if (days.length > 7) issues.push({ path: 'days', rule: 'maxDays' });
  if (opts.forPublish && days.length === 0) issues.push({ path: 'days', rule: 'minDays' });
  days.forEach((day, d) => {
    const at = (rest: string) => `days[${d}].${rest}`;
    if (!Number.isInteger(day.weekday) || day.weekday < 1 || day.weekday > 7) issues.push({ path: at('weekday'), rule: 'range' });
    else if (seen.has(day.weekday)) issues.push({ path: at('weekday'), rule: 'duplicateWeekday' });
    else seen.add(day.weekday);
    if (day.notes != null && day.notes.length > 1000) issues.push({ path: at('notes'), rule: 'maxLength' });
    if (day.meals.length > NUTRITION_LIMITS.maxMealsPerDay) issues.push({ path: at('meals'), rule: 'maxMeals' });
    if (opts.forPublish && day.meals.length === 0) issues.push({ path: at('meals'), rule: 'minMeals' });
    day.meals.forEach((meal, m) => {
      const mp = (rest: string) => `days[${d}].meals[${m}].${rest}`;
      if (!(MEAL_TYPES as readonly string[]).includes(meal.mealType)) issues.push({ path: mp('mealType'), rule: 'range' });
      if (meal.timeOfDay != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(meal.timeOfDay)) issues.push({ path: mp('timeOfDay'), rule: 'time' });
      if (meal.notes != null && meal.notes.length > 500) issues.push({ path: mp('notes'), rule: 'maxLength' });
      if (meal.items.length > NUTRITION_LIMITS.maxItemsPerMeal) issues.push({ path: mp('items'), rule: 'maxItems' });
      if (opts.forPublish && meal.items.length === 0) issues.push({ path: mp('items'), rule: 'minItems' });
      meal.items.forEach((item, i) => {
        const ip = (rest: string) => `days[${d}].meals[${m}].items[${i}].${rest}`;
        if (typeof item.name !== 'string' || item.name.trim().length < 1 || item.name.length > 120) issues.push({ path: ip('name'), rule: 'name' });
        if (item.quantity != null && !isNum(item.quantity, 0, NUTRITION_LIMITS.maxQuantity, 2)) issues.push({ path: ip('quantity'), rule: 'range' });
        if (item.unit != null && item.unit.length > 20) issues.push({ path: ip('unit'), rule: 'maxLength' });
        if (item.calories != null && !isNum(item.calories, 0, NUTRITION_LIMITS.maxCalories, 0)) issues.push({ path: ip('calories'), rule: 'range' });
        for (const f of ['proteinG', 'carbsG', 'fatG'] as const) {
          if (item[f] != null && !isNum(item[f], 0, NUTRITION_LIMITS.maxGrams, 1)) issues.push({ path: ip(f), rule: 'range' });
        }
        if (item.notes != null && item.notes.length > 300) issues.push({ path: ip('notes'), rule: 'maxLength' });
      });
    });
  });
  return issues;
}

export interface Macros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}
/** Sum of the macros that are filled in (missing values count as zero: macros are optional). */
export function mealTotals(items: readonly Pick<MealItemInput, 'calories' | 'proteinG' | 'carbsG' | 'fatG'>[]): Macros {
  const sum = (f: 'calories' | 'proteinG' | 'carbsG' | 'fatG') => Math.round(items.reduce((s, i) => s + (i[f] ?? 0), 0) * 10) / 10;
  return { calories: sum('calories'), proteinG: sum('proteinG'), carbsG: sum('carbsG'), fatG: sum('fatG') };
}

// ---------------------------------------------------------------- adherence

const SCORE: Record<MealLogStatus, number> = { COMPLETED: 1, PARTIAL: 0.5, SKIPPED: 0 };

/**
 * Share of planned meals eaten as planned: completed counts 1, partial one half, skipped and unlogged 0.
 * null when nothing was planned (an adherence of 0 % would be a lie).
 */
export function nutritionAdherencePct(plannedMeals: number, logs: readonly MealLogStatus[]): number | null {
  if (plannedMeals <= 0) return null;
  const score = logs.reduce((s, l) => s + SCORE[l], 0);
  return Math.min(100, Math.round((score / plannedMeals) * 100));
}

/** Completed workouts as a share of the workouts that were scheduled and already due. null when none were due. */
export function workoutAdherencePct(scheduledDue: number, completed: number): number | null {
  if (scheduledDue <= 0) return null;
  return Math.min(100, Math.round((completed / scheduledDue) * 100));
}

// ---------------------------------------------------------------- check-in weeks

/** First day of the week containing `date`; `weekStartsOn` is 0 (Sunday) … 6 (Saturday), like the organization setting. */
export function weekStartOf(date: string, weekStartsOn: number): string {
  const weekday = isoWeekday(date) % 7; // 0 = Sunday … 6 = Saturday
  return addDays(date, -((weekday - weekStartsOn + 7) % 7));
}
export const weekEndOf = (weekStart: string): string => addDays(weekStart, 6);

export type CheckinDueState = 'SUBMITTED' | 'REVIEWED' | 'DUE' | 'OVERDUE' | 'NONE';

/**
 * Where a client stands with their weekly check-in. A check-in for the current week is due on the week's last day;
 * a missed previous week is overdue until it is submitted. Clients without anything assigned are not tracked.
 */
export function checkinDueState(a: { today: string; weekStartsOn: number; thisWeek: CheckinStatus | null; lastWeek: CheckinStatus | null; tracked: boolean; trackedLastWeek: boolean }): CheckinDueState {
  const start = weekStartOf(a.today, a.weekStartsOn);
  if (a.thisWeek === 'REVIEWED') return 'REVIEWED';
  if (a.thisWeek === 'SUBMITTED') return 'SUBMITTED';
  if (a.trackedLastWeek && a.lastWeek !== 'SUBMITTED' && a.lastWeek !== 'REVIEWED') return 'OVERDUE';
  if (a.tracked && a.today === weekEndOf(start)) return 'DUE';
  return 'NONE';
}
