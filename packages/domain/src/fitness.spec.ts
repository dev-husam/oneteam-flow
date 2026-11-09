import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, MODULE_MANIFESTS, navigationFor } from './modules.js';
import { SYSTEM_ROLE_TEMPLATES } from './roles.js';
import {
  addDays, assignmentActiveOn, dateInTimeZone, estimatedOneRepMax, isoWeekday, scheduleIssues, scheduledDays, sessionVolume, validatePlanContent,
  type PlanDayInput,
} from './fitness.js';

const ex = (over: object = {}) => ({ exerciseId: 'e1', sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90, ...over });
const day = (over: Partial<PlanDayInput> = {}): PlanDayInput => ({ name: 'Push', exercises: [ex()], ...over });

describe('fitness manifest', () => {
  it('registers permissions in the fitness module namespace, with module grants merged into system roles', () => {
    const fitness = ALL_PERMISSIONS.filter((p) => p.moduleKey === 'fitness');
    expect(fitness.length).toBe(MODULE_MANIFESTS[0]!.permissions.length);
    expect(fitness.every((p) => p.code.startsWith('fitness.') && p.scopeType === 'ORGANIZATION')).toBe(true);
    const grants = (role: string) => SYSTEM_ROLE_TEMPLATES.find((r) => r.key === role)!.grants;
    expect(grants('owner')['fitness.workout_plan.manage']).toBe('ORG');
    expect(grants('practitioner')).toMatchObject({ 'fitness.workout_plan.manage': 'OWN', 'fitness.workout_plan.assign': 'ASSIGNED', 'fitness.client.read': 'ASSIGNED' });
    expect(grants('participant')).toMatchObject({ 'fitness.workout.log': 'OWN', 'fitness.client.read': 'OWN' });
    expect(grants('participant')['fitness.workout_plan.manage']).toBeUndefined();
    expect(grants('guardian')['fitness.client.read']).toBeUndefined();
  });

  it('adds navigation only for enabled modules, after "progress"', () => {
    const keys = (mods: string[]) => navigationFor(mods).map((i) => i.key);
    expect(keys([])).not.toContain('plans');
    expect(keys(['fitness'])).toEqual(['overview', 'members', 'invitations', 'tasks', 'messages', 'message-reports', 'progress', 'clients', 'checkins', 'plans', 'nutrition-plans', 'exercises', 'workouts', 'nutrition', 'checkin', 'groups', 'roles', 'audit', 'settings']);
  });
});

describe('validatePlanContent', () => {
  it('accepts a normal plan and an empty draft, but not an empty plan for publishing', () => {
    expect(validatePlanContent([day()], { forPublish: true })).toEqual([]);
    expect(validatePlanContent([], { forPublish: false })).toEqual([]);
    expect(validatePlanContent([], { forPublish: true })).toEqual([{ path: 'days', rule: 'minDays' }]);
    expect(validatePlanContent([day({ exercises: [] })], { forPublish: false })).toEqual([]);
    expect(validatePlanContent([day({ exercises: [] })], { forPublish: true })).toEqual([{ path: 'days[0].exercises', rule: 'minExercises' }]);
  });

  it('reports every bad value with its path', () => {
    const issues = validatePlanContent([day({ name: '  ', exercises: [ex({ sets: 0, repsMin: 12, repsMax: 8, targetWeightKg: -5, restSeconds: 5000, supersetGroup: 11 })] })], { forPublish: false });
    expect(issues).toEqual(expect.arrayContaining([
      { path: 'days[0].name', rule: 'name' },
      { path: 'days[0].exercises[0].sets', rule: 'range' },
      { path: 'days[0].exercises[0].repsMax', rule: 'repsOrder' },
      { path: 'days[0].exercises[0].targetWeightKg', rule: 'range' },
      { path: 'days[0].exercises[0].restSeconds', rule: 'range' },
      { path: 'days[0].exercises[0].supersetGroup', rule: 'range' },
    ]));
  });

  it('rejects non-integers, NaN, and more than a week of days', () => {
    expect(validatePlanContent([day({ exercises: [ex({ sets: 2.5 })] })], { forPublish: false })).toHaveLength(1);
    expect(validatePlanContent([day({ exercises: [ex({ repsMin: Number.NaN })] })], { forPublish: false }).length).toBeGreaterThan(0);
    expect(validatePlanContent(Array.from({ length: 8 }, () => day()), { forPublish: false })).toContainEqual({ path: 'days', rule: 'maxDays' });
    expect(validatePlanContent([day({ exercises: [ex({ targetWeightKg: 20.123 })] })], { forPublish: false })).toHaveLength(1);
  });
});

describe('schedules', () => {
  it('computes ISO weekdays and date arithmetic without time zones', () => {
    expect(isoWeekday('2026-11-09')).toBe(1); // Monday
    expect(isoWeekday('2026-11-15')).toBe(7); // Sunday
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('decides "today" by the organization clock', () => {
    const instant = new Date('2026-11-06T22:30:00Z');
    expect(dateInTimeZone(instant, 'UTC')).toBe('2026-11-06');
    expect(dateInTimeZone(instant, 'Asia/Riyadh')).toBe('2026-11-07'); // already tomorrow there (UTC+3)
    expect(dateInTimeZone(instant, 'America/Los_Angeles')).toBe('2026-11-06');
  });

  it('finds the plan days scheduled on a date', () => {
    const schedule = { '1': 1, '2': 3, '3': 5 };
    expect(scheduledDays(schedule, '2026-11-09')).toEqual([1]); // Monday
    expect(scheduledDays(schedule, '2026-11-11')).toEqual([2]); // Wednesday
    expect(scheduledDays(schedule, '2026-11-10')).toEqual([]); // Tuesday
  });

  it('requires existing days on distinct weekdays', () => {
    expect(scheduleIssues({ '1': 1, '2': 3 }, 2)).toEqual([]);
    expect(scheduleIssues({ '1': 1, '2': 1 }, 2)).toEqual(['2']);
    expect(scheduleIssues({ '3': 1 }, 2)).toEqual(['3']);
    expect(scheduleIssues({ '1': 8 }, 2)).toEqual(['1']);
    expect(scheduleIssues({}, 2)).toEqual(['schedule']);
  });

  it('knows when an assignment runs', () => {
    const a = { startDate: '2026-11-02', endDate: '2026-11-30', status: 'ACTIVE' as const };
    expect(assignmentActiveOn(a, '2026-11-01')).toBe(false);
    expect(assignmentActiveOn(a, '2026-11-02')).toBe(true);
    expect(assignmentActiveOn(a, '2026-11-30')).toBe(true);
    expect(assignmentActiveOn(a, '2026-12-01')).toBe(false);
    expect(assignmentActiveOn({ ...a, endDate: null }, '2027-05-01')).toBe(true);
    expect(assignmentActiveOn({ ...a, status: 'CANCELLED' }, '2026-11-10')).toBe(false);
  });
});

describe('session maths', () => {
  it('sums load only for sets that have a weight', () => {
    expect(sessionVolume([{ repsDone: 10, weightKg: 50 }, { repsDone: 8, weightKg: 52.5 }, { repsDone: 15, weightKg: null }])).toBe(920);
    expect(sessionVolume([])).toBe(0);
  });

  it('estimates a one-rep max only for sensible inputs', () => {
    expect(estimatedOneRepMax(100, 5)).toBe(116.7);
    expect(estimatedOneRepMax(100, 1)).toBe(103.3);
    expect(estimatedOneRepMax(100, 20)).toBeNull();
    expect(estimatedOneRepMax(0, 5)).toBeNull();
  });
});

import { SEED_EXERCISES } from './fitness-library.js';
import { EQUIPMENT, MUSCLE_GROUPS } from './fitness.js';

describe('seed exercise library', () => {
  it('has unique stable keys, known groups and equipment, and both languages', () => {
    expect(new Set(SEED_EXERCISES.map((e) => e.key)).size).toBe(SEED_EXERCISES.length);
    for (const e of SEED_EXERCISES) {
      expect(e.key).toMatch(/^[a-z][a-z0-9_]{2,78}$/);
      expect(MUSCLE_GROUPS).toContain(e.muscleGroup);
      expect(EQUIPMENT).toContain(e.equipment);
      expect(e.en.trim().length).toBeGreaterThan(1);
      expect(e.ar.trim().length).toBeGreaterThan(1);
    }
    expect(new Set(SEED_EXERCISES.map((e) => e.muscleGroup)).size).toBe(MUSCLE_GROUPS.length); // every group is covered
  });
});
