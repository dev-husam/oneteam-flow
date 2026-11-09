import type { Grant, PermissionDefinition } from '@pt/api-client';
import { scopeCovers, type GrantScope } from '@pt/domain';

/** '' = permission not granted. */
export type GrantChoice = '' | Exclude<GrantScope, 'ALL'>;
export type GrantState = Record<string, GrantChoice>;

const ORDER: Exclude<GrantScope, 'ALL'>[] = ['OWN', 'ASSIGNED', 'ORG'];

/**
 * Scopes the caller may put into a role for this permission: those the permission allows AND the caller holds
 * at least as broadly. This mirrors the server's escalation rule; the server still rejects anything above it.
 */
export function selectableScopes(allowed: readonly GrantScope[], held: GrantScope | undefined): Exclude<GrantScope, 'ALL'>[] {
  if (!held) return [];
  return ORDER.filter((s) => allowed.includes(s) && scopeCovers(held, s));
}

export const grantsToState = (grants: readonly Grant[]): GrantState => Object.fromEntries(grants.map((g) => [g.code, g.scope]));

export const stateToGrants = (state: GrantState): Grant[] =>
  Object.entries(state)
    .filter((entry): entry is [string, Exclude<GrantChoice, ''>] => entry[1] !== '')
    .map(([code, scope]) => ({ code, scope }));

export function groupPermissions(defs: readonly PermissionDefinition[]): [string, PermissionDefinition[]][] {
  const groups = new Map<string, PermissionDefinition[]>();
  for (const d of defs) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);
  return [...groups.entries()];
}

/** Which of the state's grants the caller could not hand out (used to warn before submitting a cloned role). */
export function grantsAbove(state: GrantState, mine: Readonly<Record<string, GrantScope>>): string[] {
  return Object.entries(state)
    .filter(([code, scope]) => scope !== '' && !(code in mine && scopeCovers(mine[code]!, scope)))
    .map(([code]) => code);
}
