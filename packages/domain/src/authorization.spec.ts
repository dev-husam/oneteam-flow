import { describe, expect, it } from 'vitest';
import { canAssignRank, canManageRank, escalationViolations, isScopeAllowed, scopeAllows, scopeCovers } from './authorization.js';
import { ALL_PERMISSIONS, ALL_PERMISSION_CODES as PERMISSION_CODES, SENSITIVE_PERMISSIONS } from './modules.js';
import { ROLE_KEYS, SYSTEM_ROLE_TEMPLATES } from './roles.js';
import { roleLabelKey, CATEGORY_KEYS } from './terminology.js';
import { CORE_NAVIGATION, visibleNavigation } from './navigation.js';
import { isValidSlug, slugify } from './slug.js';

describe('scopes', () => {
  it('orders OWN < ASSIGNED < ORG < ALL', () => {
    expect(scopeCovers('ORG', 'ASSIGNED')).toBe(true);
    expect(scopeCovers('ASSIGNED', 'ORG')).toBe(false);
    expect(scopeCovers('OWN', 'OWN')).toBe(true);
    expect(scopeCovers('ALL', 'ORG')).toBe(true);
  });

  it('scopeAllows is deny-by-default and relation based', () => {
    const none = { isOwn: false, isAssigned: false };
    expect(scopeAllows(undefined, { isOwn: true, isAssigned: true })).toBe(false);
    expect(scopeAllows('OWN', none)).toBe(false);
    expect(scopeAllows('OWN', { isOwn: true, isAssigned: false })).toBe(true);
    expect(scopeAllows('OWN', { isOwn: false, isAssigned: true })).toBe(false);
    expect(scopeAllows('ASSIGNED', { isOwn: false, isAssigned: true })).toBe(true);
    expect(scopeAllows('ASSIGNED', none)).toBe(false);
    expect(scopeAllows('ORG', none)).toBe(true);
  });
});

describe('escalation', () => {
  it('flags permissions the actor lacks or holds more narrowly', () => {
    const actor = { 'member.read': 'ASSIGNED', 'group.manage': 'OWN' } as const;
    expect(escalationViolations(actor, [{ code: 'member.read', scope: 'ASSIGNED' }])).toEqual([]);
    expect(escalationViolations(actor, [{ code: 'member.read', scope: 'ORG' }])).toEqual(['member.read']);
    expect(escalationViolations(actor, [{ code: 'role.manage', scope: 'ORG' }])).toEqual(['role.manage']);
  });

  it('rank rules: strictly below, except owners among owners', () => {
    expect(canManageRank(80, 60)).toBe(true);
    expect(canManageRank(80, 80)).toBe(false);
    expect(canManageRank(60, 80)).toBe(false);
    expect(canManageRank(100, 100)).toBe(true);
    expect(canAssignRank(80, 80)).toBe(false);
    expect(canAssignRank(80, 100)).toBe(false);
    expect(canAssignRank(100, 100)).toBe(true);
    expect(canAssignRank(60, 40)).toBe(true);
  });
});

describe('escalation: ignored permissions', () => {
  it('skips only the listed permissions', () => {
    const admin = { 'a.read': 'ORG' as const };
    const wants = [{ code: 'a.read', scope: 'ASSIGNED' as const }, { code: 'photo.read', scope: 'ASSIGNED' as const }];
    expect(escalationViolations(admin, wants)).toEqual(['photo.read']);
    expect(escalationViolations(admin, wants, { ignore: ['photo.read'] })).toEqual([]);
    expect(escalationViolations(admin, [...wants, { code: 'b.write', scope: 'OWN' }], { ignore: ['photo.read'] })).toEqual(['b.write']);
  });
});

describe('catalog integrity', () => {
  it('has unique permission codes', () => {
    expect(new Set(PERMISSION_CODES).size).toBe(PERMISSION_CODES.length);
  });

  it('every template grant references a real permission with an allowed scope of the right namespace', () => {
    for (const role of SYSTEM_ROLE_TEMPLATES) {
      for (const [code, scope] of Object.entries(role.grants)) {
        const def = ALL_PERMISSIONS.find((p) => p.code === code);
        expect(def, `${role.key} grants unknown permission ${code}`).toBeDefined();
        expect(isScopeAllowed(def!, scope), `${role.key}: ${code} cannot be ${scope}`).toBe(true);
        expect(def!.scopeType, `${role.key} mixes namespaces at ${code}`).toBe(role.scopeType);
      }
    }
  });

  it('organization roles can never hold platform permissions', () => {
    for (const role of SYSTEM_ROLE_TEMPLATES.filter((r) => r.scopeType === 'ORGANIZATION')) {
      expect(Object.keys(role.grants).some((c) => c.startsWith('platform.'))).toBe(false);
    }
  });

  it('ranks are strictly ordered and no role holds grants above a higher-ranked role', () => {
    const org = SYSTEM_ROLE_TEMPLATES.filter((r) => r.scopeType === 'ORGANIZATION').sort((a, b) => b.rank - a.rank);
    expect(org.map((r) => r.key)).toEqual(['owner', 'admin', 'manager', 'practitioner', 'guardian', 'participant']);
    // Sensitive permissions are granted by accountability, not rank (admins do not hold them): checked separately below.
    const asRequests = (r: (typeof org)[number]) => Object.entries(r.grants).filter(([code]) => !SENSITIVE_PERMISSIONS.includes(code)).map(([code, scope]) => ({ code, scope }));
    const byKey = Object.fromEntries(org.map((r) => [r.key, r]));
    // staff chain
    for (const [hi, lo] of [['owner', 'admin'], ['admin', 'manager'], ['manager', 'practitioner']] as const) {
      expect(escalationViolations(byKey[hi]!.grants, asRequests(byKey[lo]!)), `${lo} exceeds ${hi}`).toEqual([]);
    }
    // guardian and participant are parallel end-user roles, both within practitioner
    for (const lo of ['guardian', 'participant'] as const) {
      expect(escalationViolations(byKey.practitioner!.grants, asRequests(byKey[lo]!)), `${lo} exceeds practitioner`).toEqual([]);
    }
  });

  it('special-category permissions: owners and trainers/clients for their own people, never admins or managers by default', () => {
    const grants = (k: string) => SYSTEM_ROLE_TEMPLATES.find((r) => r.key === k)!.grants;
    expect(grants('owner')['fitness.photo.read']).toBe('ORG');
    expect(grants('admin')['fitness.photo.read']).toBeUndefined();
    expect(grants('manager')['fitness.photo.read']).toBeUndefined();
    expect(grants('practitioner')['fitness.photo.read']).toBe('ASSIGNED');
    expect(grants('participant')['fitness.photo.read']).toBe('OWN');
    expect(grants('guardian')['fitness.photo.read']).toBeUndefined();
  });

  it('knows every role key', () => {
    for (const key of ROLE_KEYS) expect(SYSTEM_ROLE_TEMPLATES.some((r) => r.key === key)).toBe(true);
  });
});

describe('terminology', () => {
  it('labels generic roles by category without hard-coding industries in role keys', () => {
    expect(roleLabelKey('practitioner', 'fitness')).toBe('role.practitioner.trainer');
    expect(roleLabelKey('participant', 'education')).toBe('role.participant.student');
    expect(roleLabelKey('owner', 'fitness')).toBe('role.owner.default');
    for (const c of CATEGORY_KEYS) expect(roleLabelKey('practitioner', c)).toMatch(/^role\.practitioner\./);
  });
});

describe('navigation', () => {
  it('shows only items the member may use', () => {
    const participant = visibleNavigation(CORE_NAVIGATION, { 'member.read': 'OWN' }, []).map((i) => i.key);
    expect(participant).toEqual(['overview', 'members']);
    const withTasks = visibleNavigation(CORE_NAVIGATION, { 'member.read': 'OWN', 'task.read': 'OWN', 'progress.read': 'OWN' }, []).map((i) => i.key);
    expect(withTasks).toEqual(['overview', 'members', 'tasks', 'progress']);
    const owner = visibleNavigation(CORE_NAVIGATION, Object.fromEntries(PERMISSION_CODES.map((c) => [c, 'ORG'])), []).map((i) => i.key);
    expect(owner).toContain('settings');
  });
});

describe('slug', () => {
  it('slugifies latin names and rejects reserved or malformed slugs', () => {
    expect(slugify('Iron  Gym & Fitness!')).toBe('iron-gym-fitness');
    expect(slugify('نادي القوة')).toBe('');
    expect(isValidSlug('iron-gym')).toBe(true);
    expect(isValidSlug('admin')).toBe(false);
    expect(isValidSlug('a')).toBe(false);
    expect(isValidSlug('-bad-')).toBe(false);
    expect(isValidSlug('UPPER')).toBe(false);
  });
});
