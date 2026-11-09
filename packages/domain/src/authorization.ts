import type { GrantScope, PermissionDefinition } from './permissions.js';

/** permission code → strongest scope the holder has. */
export type Grants = Readonly<Record<string, GrantScope>>;
export interface GrantRequest {
  code: string;
  scope: GrantScope;
}

export const OWNER_RANK = 100;

const SCOPE_ORDER: Record<GrantScope, number> = { OWN: 1, ASSIGNED: 2, ORG: 3, ALL: 4 };

/** True when `held` is at least as broad as `needed`. */
export const scopeCovers = (held: GrantScope, needed: GrantScope): boolean =>
  SCOPE_ORDER[held] >= SCOPE_ORDER[needed];

export interface ResourceRelation {
  /** The resource belongs to / was created by / is about the acting member. */
  isOwn: boolean;
  /** The resource is about a participant actively assigned to the acting member. */
  isAssigned: boolean;
}

/** May a holder of `grant` act on a resource that has this relation to them? Pure, deny by default. */
export function scopeAllows(grant: GrantScope | undefined, rel: ResourceRelation): boolean {
  switch (grant) {
    case 'ORG':
    case 'ALL':
      return true;
    case 'ASSIGNED':
      return rel.isAssigned || rel.isOwn;
    case 'OWN':
      return rel.isOwn;
    default:
      return false;
  }
}

/**
 * Privilege-escalation guard: lists every requested grant the actor does not hold at least as broadly.
 * An empty result means the actor may hand out exactly these grants.
 * `ignore` lists permissions that do not count: used for the platform's own system roles, whose sensitive
 * permissions (e.g. progress photos) are predefined and limited to the holder's own people, never for custom roles.
 */
export function escalationViolations(actor: Grants, requested: readonly GrantRequest[], opts: { ignore?: readonly string[] } = {}): string[] {
  return requested
    .filter((r) => !opts.ignore?.includes(r.code))
    .filter((r) => {
      const held = actor[r.code];
      return !held || !scopeCovers(held, r.scope);
    })
    .map((r) => r.code);
}

/** Whether `scope` is a legal grant for the permission (e.g. no ASSIGNED on settings). */
export function isScopeAllowed(def: PermissionDefinition, scope: GrantScope): boolean {
  return def.allowedScopes.includes(scope);
}

/** The actor may act on a member only if outranking them; owners may also act on other owners. */
export const canManageRank = (actorRank: number, targetRank: number): boolean =>
  actorRank > targetRank || (actorRank >= OWNER_RANK && targetRank <= OWNER_RANK);

/** The actor may hand out a role only if it ranks below them (owners may hand out owner). */
export const canAssignRank = (actorRank: number, roleRank: number): boolean =>
  roleRank < actorRank || (actorRank >= OWNER_RANK && roleRank <= OWNER_RANK);
