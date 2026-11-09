import { describe, expect, it } from 'vitest';
import { MESSAGE_MAX_LENGTH, directKey, mayStartConversation, normalizeBody } from './messaging.js';

describe('direct conversations', () => {
  it('gives the same key for the same pair in either order', () => {
    expect(directKey('b', 'a')).toBe('a:b');
    expect(directKey('a', 'b')).toBe(directKey('b', 'a'));
    expect(directKey('a', 'b')).not.toBe(directKey('a', 'c'));
  });
  it('fits the key column for two UUIDs', () => {
    const id = '01a1b176-c7f4-7320-ac2a-600a7862cf71';
    expect(directKey(id, id).length).toBeLessThanOrEqual(73);
  });
});

describe('who may start a conversation', () => {
  it('follows the grant scope: org-wide, assigned only, or nobody', () => {
    expect(mayStartConversation('ORG', { assigned: false })).toBe(true);
    expect(mayStartConversation('ASSIGNED', { assigned: true })).toBe(true);
    expect(mayStartConversation('ASSIGNED', { assigned: false })).toBe(false);
    expect(mayStartConversation('OWN', { assigned: true })).toBe(false);
    expect(mayStartConversation(undefined, { assigned: true })).toBe(false);
  });
});

describe('message body', () => {
  it('normalizes line endings and trims', () => {
    expect(normalizeBody('  hi\r\nthere \n')).toBe('hi\nthere');
    expect(normalizeBody('   ')).toBe('');
  });
  it('has a sane limit', () => expect(MESSAGE_MAX_LENGTH).toBeGreaterThan(500));
});

import { REPORT_REASONS, REPORT_STATUSES } from './messaging.js';
describe('report vocabulary', () => {
  it('starts open and has a few plain reasons', () => {
    expect(REPORT_STATUSES[0]).toBe('OPEN');
    expect(REPORT_REASONS).toContain('OTHER');
  });
});
