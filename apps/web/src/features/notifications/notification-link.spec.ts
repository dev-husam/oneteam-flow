import { describe, expect, it } from 'vitest';
import { notificationHref } from './notification-link';

const ID = '01a1b1ba-4028-741e-aebd-c2e37495e564';

describe('notificationHref', () => {
  it('opens the task a notification is about', () => {
    expect(notificationHref({ data: { orgSlug: 'demo-gym', taskId: ID } })).toBe(`/o/demo-gym/tasks/${ID}`);
  });

  it('opens progress for goals and the workspace otherwise', () => {
    expect(notificationHref({ data: { orgSlug: 'demo-gym', goalId: 'g1' } })).toBe('/o/demo-gym/progress');
    expect(notificationHref({ data: { orgSlug: 'demo-gym' } })).toBe('/o/demo-gym');
  });

  it('opens the client page for a trainer and the workouts page for a client', () => {
    expect(notificationHref({ data: { orgSlug: 'demo-gym', clientId: ID } })).toBe(`/o/demo-gym/clients/${ID}`);
    expect(notificationHref({ data: { orgSlug: 'demo-gym', workouts: '1' } })).toBe('/o/demo-gym/workouts');
    expect(notificationHref({ data: { orgSlug: 'demo-gym', clientId: '../../admin' } })).toBe('/o/demo-gym');
  });

  it('opens check-ins and nutrition from their payloads', () => {
    expect(notificationHref({ data: { orgSlug: 'demo-gym', checkinId: ID } })).toBe(`/o/demo-gym/checkins/${ID}`);
    expect(notificationHref({ data: { orgSlug: 'demo-gym', checkin: '1' } })).toBe('/o/demo-gym/checkin');
    expect(notificationHref({ data: { orgSlug: 'demo-gym', conversationId: ID } })).toBe(`/o/demo-gym/messages?c=${ID}`);
    expect(notificationHref({ data: { orgSlug: 'demo-gym', conversationId: '../../x' } })).toBe('/o/demo-gym');
    expect(notificationHref({ data: { orgSlug: 'demo-gym', coaching: 'client' } })).toBe('/o/demo-gym/my-coaching');
    expect(notificationHref({ data: { orgSlug: 'demo-gym', coaching: 'coach', coachClientId: ID } })).toBe(`/o/demo-gym/coaching/clients/${ID}`);
    expect(notificationHref({ data: { orgSlug: 'demo-gym', coaching: 'coach', coachClientId: '../x' } })).toBe('/o/demo-gym/coaching');
    expect(notificationHref({ data: { orgSlug: 'demo-gym', reports: '1' } })).toBe('/o/demo-gym/message-reports');
    expect(notificationHref({ data: { orgSlug: 'demo-gym', nutrition: '1' } })).toBe('/o/demo-gym/nutrition');
    expect(notificationHref({ data: { orgSlug: 'demo-gym', checkinId: '../../x' } })).toBe('/o/demo-gym');
  });

  it('never builds a link from a payload that is not a plain slug and id', () => {
    expect(notificationHref({ data: null })).toBeNull();
    expect(notificationHref({ data: { taskId: ID } })).toBeNull();
    expect(notificationHref({ data: { orgSlug: 'https://evil.example', taskId: ID } })).toBeNull();
    expect(notificationHref({ data: { orgSlug: '../admin', taskId: ID } })).toBeNull();
    // a task id that is not an id falls back to the workspace rather than being interpolated into a path
    expect(notificationHref({ data: { orgSlug: 'demo-gym', taskId: '../../admin' } })).toBe('/o/demo-gym');
  });
});
