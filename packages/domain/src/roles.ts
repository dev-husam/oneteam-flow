import type { GrantScope } from './permissions.js';
import { ALL_PERMISSIONS, MODULE_MANIFESTS, SENSITIVE_PERMISSIONS } from './modules.js';

export const ROLE_KEYS = ['owner', 'admin', 'manager', 'practitioner', 'guardian', 'participant'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
export const PLATFORM_ROLE_KEYS = ['super_admin'] as const;

/**
 * Roles organizations no longer hand out (product decision, Phase 7a): an organization has an owner, trainers
 * (`practitioner`) and clients (`participant`). The definitions stay so existing data and the authorization
 * suite keep working, but the API refuses to assign them and hides them from every picker.
 */
export const RETIRED_ROLE_KEYS: readonly string[] = ['admin', 'manager'];
export const isRetiredRole = (key: string): boolean => RETIRED_ROLE_KEYS.includes(key);

export interface RoleTemplate {
  key: string;
  scopeType: 'PLATFORM' | 'ORGANIZATION';
  rank: number;
  grants: Readonly<Record<string, GrantScope>>;
}

const BROADEST: GrantScope[] = ['ORG', 'ASSIGNED', 'OWN'];
/** Every organization permission at the widest scope it allows (some, like task.update_status, are personal only). */
const everythingInOrg = Object.fromEntries(
  ALL_PERMISSIONS.filter((p) => p.scopeType === 'ORGANIZATION').map((p) => [p.code, BROADEST.find((s) => p.allowedScopes.includes(s))!]),
);
const everythingOnPlatform = Object.fromEntries(
  ALL_PERMISSIONS.filter((p) => p.scopeType === 'PLATFORM').map((p) => [p.code, 'ALL' as GrantScope]),
);

/**
 * Immutable system templates. Organizations clone them into custom roles. Labels (Trainer, Teacher,
 * Client, Student…) come from the organization's category, not from the role key (see terminology.ts).
 */
const withModules = (key: string, grants: Readonly<Record<string, GrantScope>>): Readonly<Record<string, GrantScope>> =>
  Object.assign({}, grants, ...MODULE_MANIFESTS.map((m) => m.roleDefaults[key] ?? {}));

const BASE_TEMPLATES: readonly RoleTemplate[] = [
  { key: 'owner', scopeType: 'ORGANIZATION', rank: 100, grants: everythingInOrg },
  // Admins run the organization but do not see special-category data (e.g. progress photos) unless an owner grants it.
  { key: 'admin', scopeType: 'ORGANIZATION', rank: 80, grants: Object.fromEntries(Object.entries(everythingInOrg).filter(([code]) => !SENSITIVE_PERMISSIONS.includes(code))) },
  {
    key: 'manager',
    scopeType: 'ORGANIZATION',
    rank: 60,
    grants: {
      'member.read': 'ORG',
      'member.invite': 'ORG',
      'invitation.read': 'ORG',
      'invitation.manage': 'ORG',
      'role.read': 'ORG',
      'group.read': 'ORG',
      'group.manage': 'ORG',
      'assignment.read': 'ORG',
      'assignment.manage': 'ORG',
      'task.read': 'ORG',
      'task.create': 'ORG',
      'task.manage': 'ORG',
      'task.update_status': 'OWN',
      'task.comment': 'ORG',
      'progress.read': 'ORG',
      'progress.record': 'ORG',
      'goal.manage': 'ORG',
      'file.upload': 'ORG',
      'activity.read': 'ORG',
      'message.send': 'ORG',
    },
  },
  {
    key: 'practitioner',
    scopeType: 'ORGANIZATION',
    rank: 40,
    grants: {
      'member.read': 'ASSIGNED',
      'member.invite': 'ORG',
      'invitation.read': 'OWN',
      'invitation.manage': 'OWN',
      'group.read': 'OWN',
      'group.manage': 'OWN',
      'assignment.read': 'OWN',
      'task.read': 'ASSIGNED',
      'task.create': 'ASSIGNED',
      'task.manage': 'OWN',
      'task.update_status': 'OWN',
      'task.comment': 'ASSIGNED',
      'progress.read': 'ASSIGNED',
      'progress.record': 'ASSIGNED',
      'goal.manage': 'ASSIGNED',
      'file.upload': 'ORG',
      'activity.read': 'ASSIGNED',
      'message.send': 'ASSIGNED',
    },
  },
  { key: 'guardian', scopeType: 'ORGANIZATION', rank: 20, grants: { 'member.read': 'OWN' } },
  {
    key: 'participant',
    scopeType: 'ORGANIZATION',
    rank: 10,
    // Clients do not see the member list: they reach their trainer through messaging and their own plans.
    grants: {
      'assignment.read': 'OWN',
      'task.read': 'OWN',
      'task.update_status': 'OWN',
      'task.comment': 'OWN',
      'progress.read': 'OWN',
      'progress.record': 'OWN',
      'file.upload': 'ORG',
      'activity.read': 'OWN',
      'message.send': 'ASSIGNED',
    },
  },
  { key: 'super_admin', scopeType: 'PLATFORM', rank: 1000, grants: everythingOnPlatform },
];

/** Base templates plus the grants each enabled-by-default business module adds. */
export const SYSTEM_ROLE_TEMPLATES: readonly RoleTemplate[] = BASE_TEMPLATES.map((t) => ({ ...t, grants: withModules(t.key, t.grants) }));
