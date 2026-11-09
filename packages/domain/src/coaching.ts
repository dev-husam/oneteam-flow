import type { Bilingual } from './brand.js';
import type { NavItem } from './navigation.js';
import { orgPermission, type GrantScope, type PermissionDefinition } from './permissions.js';

/**
 * The Coaching business module: manifest (permissions, default grants, navigation) plus the pure rules for
 * sessions, notes, assessments and their trends. The platform reads the manifest; nothing in core imports Coaching code.
 */
export const COACHING_MODULE_KEY = 'coaching';

const coach = (code: string, description: string, scopes: readonly GrantScope[]): PermissionDefinition => ({
  ...orgPermission(code, 'coaching', description, scopes),
  moduleKey: COACHING_MODULE_KEY,
});

export const COACHING_PERMISSIONS: readonly PermissionDefinition[] = [
  coach('coaching.session.read', 'See coaching sessions', ['OWN', 'ASSIGNED', 'ORG']),
  coach('coaching.session.manage', 'Schedule, change, cancel and complete sessions', ['ASSIGNED', 'ORG']),
  coach('coaching.note.read', 'Read session notes shared with the client', ['OWN', 'ASSIGNED', 'ORG']),
  coach('coaching.note.write', 'Write session notes (private or shared)', ['ASSIGNED', 'ORG']),
  coach('coaching.note.private.read', 'Read private coach notes (sensitive: reading someone else’s notes is audited)', ['OWN', 'ORG']),
  coach('coaching.assessment.manage', 'Create assessment templates and ask clients to complete them', ['ASSIGNED', 'ORG']),
  coach('coaching.assessment.read', 'See assessment answers and trends', ['OWN', 'ASSIGNED', 'ORG']),
  coach('coaching.assessment.submit', 'Complete assessments asked of you', ['OWN']),
  coach('coaching.resource.manage', 'Share files and links with clients', ['ASSIGNED', 'ORG']),
  coach('coaching.resource.read', 'See resources shared with you', ['OWN', 'ASSIGNED', 'ORG']),
];

/**
 * Private coach notes are the coach’s own working notes about a client. They are held by accountability, not rank:
 * a coach reads the notes they wrote (OWN), owners can read all (ORG, audited), clients and admins never.
 */
export const COACHING_SENSITIVE_PERMISSIONS: readonly string[] = ['coaching.note.private.read'];

export const COACHING_ROLE_DEFAULTS: Readonly<Record<string, Readonly<Record<string, GrantScope>>>> = {
  // Retired role (see roles.ts) kept above trainers in rank so the invariant "no role exceeds a higher-ranked one" holds.
  manager: {
    'coaching.session.read': 'ORG',
    'coaching.session.manage': 'ORG',
    'coaching.note.read': 'ORG',
    'coaching.note.write': 'ORG',
    'coaching.assessment.manage': 'ORG',
    'coaching.assessment.read': 'ORG',
    'coaching.assessment.submit': 'OWN',
    'coaching.resource.manage': 'ORG',
    'coaching.resource.read': 'ORG',
  },
  practitioner: {
    'coaching.session.read': 'ASSIGNED',
    'coaching.session.manage': 'ASSIGNED',
    'coaching.note.read': 'ASSIGNED',
    'coaching.note.write': 'ASSIGNED',
    'coaching.note.private.read': 'OWN',
    'coaching.assessment.manage': 'ASSIGNED',
    'coaching.assessment.read': 'ASSIGNED',
    // Trainers hold what clients hold (their own scope), so they can invite clients: nobody hands out more than they have.
    'coaching.assessment.submit': 'OWN',
    'coaching.resource.manage': 'ASSIGNED',
    'coaching.resource.read': 'ASSIGNED',
  },
  participant: {
    'coaching.session.read': 'OWN',
    'coaching.note.read': 'OWN',
    'coaching.assessment.read': 'OWN',
    'coaching.assessment.submit': 'OWN',
    'coaching.resource.read': 'OWN',
  },
};

export const COACHING_NAVIGATION: readonly NavItem[] = [
  { key: 'coaching', labelKey: 'nav.coaching', path: '/o/{orgSlug}/coaching', requiredPermission: 'coaching.session.manage', moduleKey: COACHING_MODULE_KEY },
  { key: 'assessments', labelKey: 'nav.assessments', path: '/o/{orgSlug}/assessments', requiredPermission: 'coaching.assessment.manage', moduleKey: COACHING_MODULE_KEY },
  { key: 'resources', labelKey: 'nav.resources', path: '/o/{orgSlug}/resources', requiredPermission: 'coaching.resource.manage', moduleKey: COACHING_MODULE_KEY },
  { key: 'my-coaching', labelKey: 'nav.myCoaching', path: '/o/{orgSlug}/my-coaching', requiredPermission: 'coaching.assessment.submit', hiddenWithPermission: 'coaching.session.manage', moduleKey: COACHING_MODULE_KEY },
];

// ---------------------------------------------------------------- sessions

export const SESSION_STATUSES = ['PLANNED', 'HELD', 'CANCELLED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const SESSION_LIMITS = { minMinutes: 15, maxMinutes: 240, location: 255, agenda: 1000, cancelReason: 300, note: 5000 } as const;
export const NOTE_VISIBILITIES = ['PRIVATE', 'SHARED'] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];

/** Which reminder a planned session needs now. Each is sent at most once; a session created close to its start skips the day-before one. */
export function sessionReminderDue(now: Date, startsAt: Date, sent: { day: boolean; soon: boolean }): 'day' | 'soon' | null {
  const ms = startsAt.getTime() - now.getTime();
  const hour = 3_600_000;
  if (ms <= 0) return null;
  if (ms <= 2 * hour) return sent.soon ? null : 'soon';
  if (ms <= 24 * hour) return sent.day || sent.soon ? null : 'day';
  return null;
}

// ---------------------------------------------------------------- assessments

export const QUESTION_KINDS = ['SCALE', 'YESNO', 'TEXT'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export interface AssessmentQuestion {
  /** Stable within a template: answers refer to it. Lower-case letters, digits and underscores. */
  id: string;
  kind: QuestionKind;
  label: Bilingual;
}
export type AnswerValue = number | boolean | string;
export type AssessmentAnswers = Record<string, AnswerValue>;

export const ASSESSMENT_LIMITS = { maxQuestions: 20, label: 120, text: 1000, name: 120, description: 500, scaleMin: 1, scaleMax: 10, minCadenceDays: 7, maxCadenceDays: 365 } as const;
const QUESTION_ID = /^[a-z][a-z0-9_]{0,29}$/;
export type AssessmentIssue = { path: string; rule: string };

const label = (l: unknown): l is Bilingual =>
  typeof l === 'object' && l !== null &&
  ['en', 'ar'].every((k) => typeof (l as Record<string, unknown>)[k] === 'string' && ((l as Record<string, string>)[k] as string).length <= ASSESSMENT_LIMITS.label) &&
  ['en', 'ar'].some((k) => ((l as Record<string, string>)[k] as string).trim().length > 0) &&
  !/[<>]/.test(`${(l as Bilingual).en}${(l as Bilingual).ar}`);

/** A question needs text in at least one language; the other falls back to it when shown. */
export function validateQuestions(input: unknown): { ok: true; value: AssessmentQuestion[] } | { ok: false; issues: AssessmentIssue[] } {
  const issues: AssessmentIssue[] = [];
  if (!Array.isArray(input) || input.length === 0) return { ok: false, issues: [{ path: 'questions', rule: 'required' }] };
  if (input.length > ASSESSMENT_LIMITS.maxQuestions) issues.push({ path: 'questions', rule: 'maxQuestions' });
  const seen = new Set<string>();
  const value: AssessmentQuestion[] = [];
  input.slice(0, ASSESSMENT_LIMITS.maxQuestions).forEach((q: unknown, i) => {
    const o = (q ?? {}) as Partial<AssessmentQuestion>;
    if (typeof o.id !== 'string' || !QUESTION_ID.test(o.id)) issues.push({ path: `questions[${i}].id`, rule: 'id' });
    else if (seen.has(o.id)) issues.push({ path: `questions[${i}].id`, rule: 'duplicate' });
    else seen.add(o.id);
    if (!(QUESTION_KINDS as readonly unknown[]).includes(o.kind)) issues.push({ path: `questions[${i}].kind`, rule: 'kind' });
    if (!label(o.label)) issues.push({ path: `questions[${i}].label`, rule: 'label' });
    else if (typeof o.id === 'string' && QUESTION_KINDS.includes(o.kind as QuestionKind)) value.push({ id: o.id, kind: o.kind as QuestionKind, label: { en: o.label.en.trim(), ar: o.label.ar.trim() } });
  });
  return issues.length ? { ok: false, issues } : { ok: true, value };
}

/** Scale and yes/no questions must be answered; text is optional. Unknown answers are rejected. */
export function validateAnswers(questions: readonly AssessmentQuestion[], answers: unknown): { ok: true; value: AssessmentAnswers } | { ok: false; issues: AssessmentIssue[] } {
  const issues: AssessmentIssue[] = [];
  const given = (answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {}) as Record<string, unknown>;
  const known = new Set(questions.map((q) => q.id));
  for (const k of Object.keys(given)) if (!known.has(k)) issues.push({ path: `answers.${k}`, rule: 'unknown' });
  const value: AssessmentAnswers = {};
  for (const q of questions) {
    const a = given[q.id];
    const path = `answers.${q.id}`;
    if (q.kind === 'SCALE') {
      if (typeof a !== 'number' || !Number.isInteger(a) || a < ASSESSMENT_LIMITS.scaleMin || a > ASSESSMENT_LIMITS.scaleMax) issues.push({ path, rule: a === undefined ? 'required' : 'range' });
      else value[q.id] = a;
    } else if (q.kind === 'YESNO') {
      if (typeof a !== 'boolean') issues.push({ path, rule: a === undefined ? 'required' : 'type' });
      else value[q.id] = a;
    } else if (a !== undefined && a !== '') {
      if (typeof a !== 'string' || a.length > ASSESSMENT_LIMITS.text) issues.push({ path, rule: 'text' });
      else value[q.id] = a.trim();
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value };
}

export const isValidCadence = (days: unknown): days is number | null =>
  days === null || (typeof days === 'number' && Number.isInteger(days) && days >= ASSESSMENT_LIMITS.minCadenceDays && days <= ASSESSMENT_LIMITS.maxCadenceDays);

/** When the next repeat of a recurring assessment is due, counted from when the client finished the last one. */
export const nextDueAt = (completedAt: Date, cadenceDays: number): Date => new Date(completedAt.getTime() + cadenceDays * 86_400_000);

export const questionLabel = (q: AssessmentQuestion, locale: 'en' | 'ar'): string => q.label[locale].trim() || q.label[locale === 'en' ? 'ar' : 'en'];

/** The starting point most coaches use: a "wheel of life" with eight areas scored 1 to 10. */
export const WHEEL_OF_LIFE_QUESTIONS: readonly AssessmentQuestion[] = [
  ['health', 'Health and energy', 'الصحة والطاقة'],
  ['career', 'Career or work', 'العمل والمسار المهني'],
  ['money', 'Money and finances', 'المال والشؤون المالية'],
  ['relationships', 'Family and relationships', 'الأسرة والعلاقات'],
  ['growth', 'Personal growth and learning', 'النمو الشخصي والتعلّم'],
  ['fun', 'Fun and recreation', 'الترفيه والاستمتاع'],
  ['environment', 'Home and environment', 'المنزل والبيئة'],
  ['purpose', 'Purpose and meaning', 'الهدف والمعنى'],
].map(([id, en, ar]) => ({ id: id!, kind: 'SCALE' as const, label: { en: en!, ar: ar! } }));

export interface CompletedAssessmentForTrend {
  id: string;
  completedAt: string | Date;
  questions: readonly AssessmentQuestion[];
  answers: AssessmentAnswers;
}
export interface TrendSeries {
  questionId: string;
  label: Bilingual;
  points: { at: string; value: number }[];
  /** Latest value minus the first; null with fewer than two points. */
  change: number | null;
}

/** One line per scale question across completed assessments, oldest first. Questions from different templates stay separate by id and label. */
export function assessmentTrends(items: readonly CompletedAssessmentForTrend[]): TrendSeries[] {
  const series = new Map<string, TrendSeries>();
  [...items]
    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
    .forEach((item) => {
      for (const q of item.questions) {
        const v = item.answers[q.id];
        if (q.kind !== 'SCALE' || typeof v !== 'number') continue;
        const s = series.get(q.id) ?? { questionId: q.id, label: q.label, points: [], change: null };
        s.points.push({ at: new Date(item.completedAt).toISOString(), value: v });
        s.label = q.label;
        series.set(q.id, s);
      }
    });
  return [...series.values()].map((s) => ({ ...s, change: s.points.length >= 2 ? s.points[s.points.length - 1]!.value - s.points[0]!.value : null }));
}
