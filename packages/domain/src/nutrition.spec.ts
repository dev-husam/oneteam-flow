import { describe, expect, it } from 'vitest';
import { checkinDueState, mealTotals, nutritionAdherencePct, validateNutritionContent, weekEndOf, weekStartOf, workoutAdherencePct, type NutritionDayInput } from './nutrition.js';

const item = (over: object = {}) => ({ name: 'Oats', quantity: 60, unit: 'g', calories: 230, proteinG: 8, carbsG: 40, fatG: 4, ...over });
const day = (over: Partial<NutritionDayInput> = {}): NutritionDayInput => ({ weekday: 1, meals: [{ mealType: 'BREAKFAST', timeOfDay: '08:00', items: [item()] }], ...over });

describe('validateNutritionContent', () => {
  it('accepts a normal plan; macros are optional', () => {
    expect(validateNutritionContent([day(), day({ weekday: 2, meals: [{ mealType: 'LUNCH', items: [{ name: 'Rice' }] }] })], { forPublish: true })).toEqual([]);
  });

  it('drafts may be empty, publishing may not', () => {
    expect(validateNutritionContent([], { forPublish: false })).toEqual([]);
    expect(validateNutritionContent([], { forPublish: true })).toEqual([{ path: 'days', rule: 'minDays' }]);
    expect(validateNutritionContent([day({ meals: [] })], { forPublish: true })).toEqual([{ path: 'days[0].meals', rule: 'minMeals' }]);
    expect(validateNutritionContent([day({ meals: [{ mealType: 'SNACK', items: [] }] })], { forPublish: true })).toEqual([{ path: 'days[0].meals[0].items', rule: 'minItems' }]);
    expect(validateNutritionContent([day({ meals: [{ mealType: 'SNACK', items: [] }] })], { forPublish: false })).toEqual([]);
  });

  it('reports every problem with its path', () => {
    const issues = validateNutritionContent([day({ weekday: 9 }), day({ weekday: 3, meals: [{ mealType: 'BRUNCH' as never, timeOfDay: '25:00', items: [item({ name: ' ', calories: -5, proteinG: 5000, quantity: 1.234 })] }] }), day({ weekday: 3 })], { forPublish: false });
    expect(issues).toEqual(expect.arrayContaining([
      { path: 'days[0].weekday', rule: 'range' },
      { path: 'days[1].meals[0].mealType', rule: 'range' },
      { path: 'days[1].meals[0].timeOfDay', rule: 'time' },
      { path: 'days[1].meals[0].items[0].name', rule: 'name' },
      { path: 'days[1].meals[0].items[0].calories', rule: 'range' },
      { path: 'days[1].meals[0].items[0].proteinG', rule: 'range' },
      { path: 'days[1].meals[0].items[0].quantity', rule: 'range' },
      { path: 'days[2].weekday', rule: 'duplicateWeekday' },
    ]));
  });
});

describe('mealTotals', () => {
  it('sums what is filled in and treats missing values as zero', () => {
    expect(mealTotals([item(), item({ calories: 100, proteinG: 2.5, carbsG: null, fatG: undefined }), { }])).toEqual({ calories: 330, proteinG: 10.5, carbsG: 40, fatG: 4 });
    expect(mealTotals([])).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});

describe('adherence', () => {
  it('scores completed 1, partial one half, skipped and missing 0', () => {
    expect(nutritionAdherencePct(4, ['COMPLETED', 'COMPLETED', 'PARTIAL', 'SKIPPED'])).toBe(63);
    expect(nutritionAdherencePct(4, ['COMPLETED'])).toBe(25); // unlogged meals count against
    expect(nutritionAdherencePct(0, [])).toBeNull();
    expect(nutritionAdherencePct(2, ['COMPLETED', 'COMPLETED', 'COMPLETED'])).toBe(100); // never above 100
  });
  it('workouts: completed over scheduled and due', () => {
    expect(workoutAdherencePct(3, 2)).toBe(67);
    expect(workoutAdherencePct(0, 0)).toBeNull();
    expect(workoutAdherencePct(2, 5)).toBe(100);
  });
});

describe('check-in weeks', () => {
  it('finds the start of the week for any first day of the week', () => {
    // 2026-11-11 is a Wednesday
    expect(weekStartOf('2026-11-11', 1)).toBe('2026-11-09'); // Monday start
    expect(weekStartOf('2026-11-11', 0)).toBe('2026-11-08'); // Sunday start
    expect(weekStartOf('2026-11-11', 6)).toBe('2026-11-07'); // Saturday start
    expect(weekStartOf('2026-11-09', 1)).toBe('2026-11-09'); // the first day is its own week start
    expect(weekStartOf('2026-11-08', 1)).toBe('2026-11-02'); // Sunday belongs to the week that started Monday 2nd
    expect(weekEndOf('2026-11-09')).toBe('2026-11-15');
  });

  it('is due on the last day, overdue when the previous week was missed, and quiet otherwise', () => {
    const base = { weekStartsOn: 1, thisWeek: null, lastWeek: null, tracked: true, trackedLastWeek: true } as const;
    expect(checkinDueState({ ...base, today: '2026-11-15', lastWeek: 'SUBMITTED' })).toBe('DUE'); // Sunday = last day
    expect(checkinDueState({ ...base, today: '2026-11-11', lastWeek: 'SUBMITTED' })).toBe('NONE');
    expect(checkinDueState({ ...base, today: '2026-11-11' })).toBe('OVERDUE'); // last week never submitted
    expect(checkinDueState({ ...base, today: '2026-11-11', lastWeek: 'DRAFT' })).toBe('OVERDUE');
    expect(checkinDueState({ ...base, today: '2026-11-15', thisWeek: 'SUBMITTED', lastWeek: 'REVIEWED' })).toBe('SUBMITTED');
    expect(checkinDueState({ ...base, today: '2026-11-15', thisWeek: 'REVIEWED' })).toBe('REVIEWED');
    expect(checkinDueState({ ...base, today: '2026-11-15', tracked: false, trackedLastWeek: false })).toBe('NONE'); // nothing assigned: not tracked
  });
});
