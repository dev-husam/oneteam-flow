import { describe, expect, it } from 'vitest';
import { grantsAbove, grantsToState, groupPermissions, selectableScopes, stateToGrants } from './role-grants';

describe('role grants helpers', () => {
  it('offers only scopes that the permission allows and the caller holds', () => {
    expect(selectableScopes(['OWN', 'ASSIGNED', 'ORG'], 'ORG')).toEqual(['OWN', 'ASSIGNED', 'ORG']);
    expect(selectableScopes(['OWN', 'ASSIGNED', 'ORG'], 'ASSIGNED')).toEqual(['OWN', 'ASSIGNED']);
    expect(selectableScopes(['OWN', 'ASSIGNED', 'ORG'], 'OWN')).toEqual(['OWN']);
    expect(selectableScopes(['ORG'], 'ASSIGNED')).toEqual([]); // cannot hand out what you hold more narrowly
    expect(selectableScopes(['OWN', 'ORG'], 'ORG')).toEqual(['OWN', 'ORG']);
    expect(selectableScopes(['ORG'], undefined)).toEqual([]); // a permission you do not hold at all
    expect(selectableScopes(['ALL'], 'ALL')).toEqual([]); // platform scope never appears in an organization role
  });

  it('round-trips between grant lists and form state, dropping ungranted rows', () => {
    const grants = [{ code: 'member.read', scope: 'ASSIGNED' as const }, { code: 'role.read', scope: 'ORG' as const }];
    const state = grantsToState(grants);
    expect(state).toEqual({ 'member.read': 'ASSIGNED', 'role.read': 'ORG' });
    expect(stateToGrants({ ...state, 'group.read': '' })).toEqual(grants);
  });

  it('detects grants the caller could not hand out', () => {
    const mine = { 'member.read': 'ASSIGNED', 'role.read': 'ORG' } as const;
    expect(grantsAbove({ 'member.read': 'ORG', 'role.read': 'ORG', 'audit.read': 'ORG' }, mine)).toEqual(['member.read', 'audit.read']);
    expect(grantsAbove({ 'member.read': '' }, mine)).toEqual([]);
  });

  it('groups permission definitions by their group, keeping order', () => {
    const def = (code: string, group: string) => ({ code, group, moduleKey: null, description: '', allowedScopes: ['ORG' as const] });
    expect(groupPermissions([def('a.1', 'a'), def('b.1', 'b'), def('a.2', 'a')]).map(([g, d]) => [g, d.map((x) => x.code)])).toEqual([['a', ['a.1', 'a.2']], ['b', ['b.1']]]);
  });
});
