import type { RoleKey } from './roles.js';

export const CATEGORY_KEYS = ['fitness', 'education', 'business', 'coaching'] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/**
 * Industry vocabulary lives here (data), never in core code or role keys.
 * Values are i18n term ids: the label key for a role is `role.<roleKey>.<term>`.
 */
const TERMS: Record<CategoryKey, Partial<Record<RoleKey, string>>> = {
  fitness: { practitioner: 'trainer', participant: 'client' },
  education: { practitioner: 'teacher', participant: 'student', guardian: 'parent' },
  business: { practitioner: 'employee', participant: 'employee' },
  coaching: { practitioner: 'coach', participant: 'client' },
};

export function roleLabelKey(roleKey: string, categoryKey: string): string {
  const term = (TERMS as Record<string, Partial<Record<string, string>>>)[categoryKey]?.[roleKey];
  return term ? `role.${roleKey}.${term}` : `role.${roleKey}.default`;
}
