import { describe, expect, it } from 'vitest';
import { isRetiredRole, RETIRED_ROLE_KEYS, SYSTEM_ROLE_TEMPLATES } from './roles.js';

const template = (key: string) => SYSTEM_ROLE_TEMPLATES.find((t) => t.key === key)!;

describe('organization roles (Phase 7a)', () => {
  it('admin and manager are retired; owner, trainer and client are not', () => {
    expect([...RETIRED_ROLE_KEYS].sort()).toEqual(['admin', 'manager']);
    for (const key of ['owner', 'practitioner', 'participant', 'guardian', 'super_admin']) expect(isRetiredRole(key), key).toBe(false);
  });

  it('clients cannot see the member list; trainers see their own clients; owners see everyone', () => {
    expect(template('participant').grants['member.read']).toBeUndefined();
    expect(template('practitioner').grants['member.read']).toBe('ASSIGNED');
    expect(template('owner').grants['member.read']).toBe('ORG');
  });

  it('clients can still message their trainer and use their own plans', () => {
    expect(template('participant').grants['message.send']).toBe('ASSIGNED');
    expect(template('participant').grants['fitness.workout.read']).toBe('OWN');
  });

  it('the owner holds every trainer permission, so an owner can coach', () => {
    const owner = template('owner').grants;
    for (const code of Object.keys(template('practitioner').grants)) expect(owner[code], code).toBeDefined();
  });
});
