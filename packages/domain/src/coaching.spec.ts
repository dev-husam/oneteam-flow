import { describe, expect, it } from 'vitest';
import { assessmentTrends, isValidCadence, nextDueAt, sessionReminderDue, validateAnswers, validateQuestions, WHEEL_OF_LIFE_QUESTIONS, COACHING_PERMISSIONS, COACHING_ROLE_DEFAULTS } from './coaching.js';
import { SYSTEM_ROLE_TEMPLATES } from './roles.js';

const grants = (role: string) => SYSTEM_ROLE_TEMPLATES.find((t) => t.key === role)!.grants;

describe('coaching permissions', () => {
  it('private notes are held by owner (all) and coach (own), never by clients or admins', () => {
    expect(grants('owner')['coaching.note.private.read']).toBe('ORG');
    expect(grants('practitioner')['coaching.note.private.read']).toBe('OWN');
    expect(grants('participant')['coaching.note.private.read']).toBeUndefined();
    expect(grants('admin')['coaching.note.private.read']).toBeUndefined();
  });
  it('clients can see and complete their own coaching, and nothing else', () => {
    expect(grants('participant')).toMatchObject({ 'coaching.session.read': 'OWN', 'coaching.note.read': 'OWN', 'coaching.assessment.submit': 'OWN', 'coaching.resource.read': 'OWN' });
    expect(grants('participant')['coaching.session.manage']).toBeUndefined();
    expect(grants('participant')['coaching.note.write']).toBeUndefined();
  });
  it('a coach holds everything a client holds, so coaches can invite clients', () => {
    for (const [code] of Object.entries(COACHING_ROLE_DEFAULTS.participant!)) expect(grants('practitioner')[code], code).toBeDefined();
  });
  it('every default grant names a real permission with a scope it allows', () => {
    const defs = new Map(COACHING_PERMISSIONS.map((p) => [p.code, p]));
    for (const role of Object.values(COACHING_ROLE_DEFAULTS)) for (const [code, scope] of Object.entries(role)) expect(defs.get(code)?.allowedScopes, code).toContain(scope);
  });
});

describe('session reminders', () => {
  const start = new Date('2026-12-01T10:00:00Z');
  const at = (hoursBefore: number) => new Date(start.getTime() - hoursBefore * 3_600_000);
  it('sends the day-before reminder inside 24 hours, the short one inside 2 hours, each once', () => {
    expect(sessionReminderDue(at(30), start, { day: false, soon: false })).toBeNull();
    expect(sessionReminderDue(at(23), start, { day: false, soon: false })).toBe('day');
    expect(sessionReminderDue(at(23), start, { day: true, soon: false })).toBeNull();
    expect(sessionReminderDue(at(1), start, { day: true, soon: false })).toBe('soon');
    expect(sessionReminderDue(at(1), start, { day: true, soon: true })).toBeNull();
    expect(sessionReminderDue(at(-1), start, { day: false, soon: false })).toBeNull(); // already started
  });
  it('a session created shortly before it starts gets only the short reminder', () => {
    expect(sessionReminderDue(at(1.5), start, { day: false, soon: false })).toBe('soon');
    expect(sessionReminderDue(at(1.4), start, { day: false, soon: true })).toBeNull();
  });
});

describe('assessments', () => {
  it('the wheel of life is valid and has eight scored areas', () => {
    const r = validateQuestions(WHEEL_OF_LIFE_QUESTIONS);
    expect(r.ok).toBe(true);
    expect(WHEEL_OF_LIFE_QUESTIONS).toHaveLength(8);
  });
  it('rejects empty, duplicate, malformed and over-long questions', () => {
    expect(validateQuestions([])).toMatchObject({ ok: false });
    const bad = validateQuestions([
      { id: 'a', kind: 'SCALE', label: { en: 'One', ar: '' } },
      { id: 'a', kind: 'SCALE', label: { en: 'Dup', ar: '' } },
      { id: 'Bad Id', kind: 'SCALE', label: { en: 'x', ar: '' } },
      { id: 'c', kind: 'RANK', label: { en: 'x', ar: '' } },
      { id: 'd', kind: 'TEXT', label: { en: '', ar: '' } },
      { id: 'e', kind: 'TEXT', label: { en: '<b>', ar: '' } },
    ]);
    expect(bad).toEqual({ ok: false, issues: expect.arrayContaining([
      { path: 'questions[1].id', rule: 'duplicate' }, { path: 'questions[2].id', rule: 'id' }, { path: 'questions[3].kind', rule: 'kind' },
      { path: 'questions[4].label', rule: 'label' }, { path: 'questions[5].label', rule: 'label' },
    ]) });
    expect(validateQuestions(Array.from({ length: 21 }, (_, i) => ({ id: `q${i}`, kind: 'TEXT', label: { en: 'x', ar: '' } })))).toMatchObject({ ok: false });
  });
  it('answers: scale 1 to 10 and yes/no are required, text is optional, strangers are refused', () => {
    const qs = validateQuestions([
      { id: 'energy', kind: 'SCALE', label: { en: 'Energy', ar: '' } },
      { id: 'slept', kind: 'YESNO', label: { en: 'Slept well', ar: '' } },
      { id: 'story', kind: 'TEXT', label: { en: 'Story', ar: '' } },
    ]);
    if (!qs.ok) throw new Error('fixture');
    expect(validateAnswers(qs.value, { energy: 7, slept: true })).toEqual({ ok: true, value: { energy: 7, slept: true } });
    expect(validateAnswers(qs.value, { energy: 7, slept: false, story: '  hi ' })).toMatchObject({ ok: true, value: { story: 'hi' } });
    expect(validateAnswers(qs.value, { energy: 11, slept: 'yes', extra: 1 })).toEqual({ ok: false, issues: expect.arrayContaining([{ path: 'answers.energy', rule: 'range' }, { path: 'answers.slept', rule: 'type' }, { path: 'answers.extra', rule: 'unknown' }]) });
    expect(validateAnswers(qs.value, {})).toMatchObject({ ok: false });
    expect(validateAnswers(qs.value, { energy: 5.5, slept: true })).toMatchObject({ ok: false });
  });
  it('cadence is a week to a year or none; the next one counts from completion', () => {
    for (const ok of [null, 7, 14, 365]) expect(isValidCadence(ok)).toBe(true);
    for (const bad of [0, 6, 366, 1.5, '14', undefined]) expect(isValidCadence(bad)).toBe(false);
    expect(nextDueAt(new Date('2026-12-01T00:00:00Z'), 14).toISOString()).toBe('2026-12-15T00:00:00.000Z');
  });
  it('trends: one line per scale question, oldest first, with the change from first to latest', () => {
    const q = [{ id: 'energy', kind: 'SCALE' as const, label: { en: 'Energy', ar: 'الطاقة' } }, { id: 'note', kind: 'TEXT' as const, label: { en: 'n', ar: '' } }];
    const t = assessmentTrends([
      { id: '2', completedAt: '2026-12-15T00:00:00Z', questions: q, answers: { energy: 8, note: 'x' } },
      { id: '1', completedAt: '2026-12-01T00:00:00Z', questions: q, answers: { energy: 5 } },
    ]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ questionId: 'energy', change: 3, points: [{ value: 5 }, { value: 8 }] });
    expect(assessmentTrends([{ id: '3', completedAt: '2026-12-20T00:00:00Z', questions: q, answers: { energy: 6 } }])[0]!.change).toBeNull();
  });
});
