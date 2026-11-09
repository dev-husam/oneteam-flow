import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers/app.js';

describe('platform: health, errors, headers, OpenAPI', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(async () => t.app.close());

  it('liveness is open and reveals nothing', async () => {
    const res = await t.http().get('/api/v1/health/live').expect(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('readiness needs the health token and reports MySQL and Redis', async () => {
    const denied = await t.http().get('/api/v1/health/ready');
    expect(denied.status).toBe(403);
    const ok = await t.http().get('/api/v1/health/ready').set('x-health-token', process.env.HEALTH_TOKEN!).expect(200);
    expect(ok.body.data.checks).toEqual({ mysql: 'up', redis: 'up' });
  });

  it('every error has code, message and requestId; the inbound request id is echoed', async () => {
    const res = await t.http().get('/api/v1/does-not-exist').set('x-request-id', 'trace-1234567890');
    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBe('trace-1234567890');
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: 'trace-1234567890' });
    const invalid = await t.http().get('/api/v1/health/live').set('x-request-id', 'bad id!');
    expect(invalid.headers['x-request-id']).not.toBe('bad id!');
  });

  it('sends hardened security headers and does not advertise the framework', async () => {
    const res = await t.http().get('/api/v1/health/live');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('CORS only allows configured origins', async () => {
    const good = await t.http().options('/api/v1/auth/login').set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'POST');
    expect(good.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(good.headers['access-control-allow-credentials']).toBe('true');
    const bad = await t.http().options('/api/v1/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects oversized JSON bodies', async () => {
    const res = await t.http().post('/api/v1/auth/login').set('x-client-type', 'ios').send({ email: 'a@b.co', password: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
  });

  it('publishes the OpenAPI document with every route under /api/v1', async () => {
    const res = await t.http().get('/api/docs-json').expect(200);
    const operations = Object.entries(res.body.paths as Record<string, Record<string, unknown>>)
      .flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`))
      .sort();
    expect(operations).toMatchInlineSnapshot(`
      [
        "DELETE /api/v1/admin/designs/{key}",
        "DELETE /api/v1/admin/email-templates/{key}/{locale}",
        "DELETE /api/v1/admin/platform-roles",
        "DELETE /api/v1/admin/settings/logo",
        "DELETE /api/v1/me/devices",
        "DELETE /api/v1/me/sessions/{id}",
        "DELETE /api/v1/orgs/{orgId}/coaching/assessment-templates/{templateId}",
        "DELETE /api/v1/orgs/{orgId}/coaching/notes/{noteId}",
        "DELETE /api/v1/orgs/{orgId}/coaching/resources/{resourceId}",
        "DELETE /api/v1/orgs/{orgId}/files/{fileId}",
        "DELETE /api/v1/orgs/{orgId}/fitness/exercises/{exerciseId}",
        "DELETE /api/v1/orgs/{orgId}/fitness/nutrition-plans/{nutritionPlanId}",
        "DELETE /api/v1/orgs/{orgId}/fitness/nutrition-plans/{nutritionPlanId}/versions/{nutritionVersionId}",
        "DELETE /api/v1/orgs/{orgId}/fitness/nutrition/logs/{mealLogId}/photos/{fileId}",
        "DELETE /api/v1/orgs/{orgId}/fitness/photos/{photoId}",
        "DELETE /api/v1/orgs/{orgId}/fitness/plans/{planId}",
        "DELETE /api/v1/orgs/{orgId}/fitness/plans/{planId}/versions/{versionId}",
        "DELETE /api/v1/orgs/{orgId}/fitness/sessions/{sessionId}/sets/{dayExerciseId}/{setNo}",
        "DELETE /api/v1/orgs/{orgId}/groups/{groupId}",
        "DELETE /api/v1/orgs/{orgId}/groups/{groupId}/members/{membershipId}",
        "DELETE /api/v1/orgs/{orgId}/invitations/{invitationId}",
        "DELETE /api/v1/orgs/{orgId}/members/{memberId}",
        "DELETE /api/v1/orgs/{orgId}/messaging/conversations/{conversationId}/messages/{messageId}",
        "DELETE /api/v1/orgs/{orgId}/roles/{roleId}",
        "DELETE /api/v1/orgs/{orgId}/tasks/{taskId}",
        "DELETE /api/v1/orgs/{orgId}/tasks/{taskId}/assignees/{membershipId}",
        "DELETE /api/v1/orgs/{orgId}/tasks/{taskId}/attachments/{fileId}",
        "DELETE /api/v1/orgs/{orgId}/tasks/{taskId}/comments/{commentId}",
        "GET /api/v1/admin/audit-logs",
        "GET /api/v1/admin/categories",
        "GET /api/v1/admin/designs",
        "GET /api/v1/admin/designs/{key}",
        "GET /api/v1/admin/email-templates",
        "GET /api/v1/admin/email-templates/{key}/{locale}",
        "GET /api/v1/admin/flags",
        "GET /api/v1/admin/health",
        "GET /api/v1/admin/modules",
        "GET /api/v1/admin/organizations",
        "GET /api/v1/admin/organizations/{organizationId}",
        "GET /api/v1/admin/organizations/{organizationId}/design",
        "GET /api/v1/admin/organizations/{organizationId}/flags",
        "GET /api/v1/admin/platform-roles",
        "GET /api/v1/admin/settings",
        "GET /api/v1/admin/stats",
        "GET /api/v1/admin/users",
        "GET /api/v1/admin/users/{userId}",
        "GET /api/v1/catalog/categories",
        "GET /api/v1/config/logo",
        "GET /api/v1/config/public",
        "GET /api/v1/health/live",
        "GET /api/v1/health/ready",
        "GET /api/v1/me",
        "GET /api/v1/me/design",
        "GET /api/v1/me/designs",
        "GET /api/v1/me/notification-preferences",
        "GET /api/v1/me/notifications",
        "GET /api/v1/me/notifications/unread-count",
        "GET /api/v1/me/organizations",
        "GET /api/v1/me/platform-access",
        "GET /api/v1/me/sessions",
        "GET /api/v1/orgs/{orgId}",
        "GET /api/v1/orgs/{orgId}/activity",
        "GET /api/v1/orgs/{orgId}/assignable-roles",
        "GET /api/v1/orgs/{orgId}/assignments",
        "GET /api/v1/orgs/{orgId}/audit-logs",
        "GET /api/v1/orgs/{orgId}/coaching/assessment-templates",
        "GET /api/v1/orgs/{orgId}/coaching/assessments",
        "GET /api/v1/orgs/{orgId}/coaching/assessments/trends",
        "GET /api/v1/orgs/{orgId}/coaching/assessments/{assessmentId}",
        "GET /api/v1/orgs/{orgId}/coaching/notes",
        "GET /api/v1/orgs/{orgId}/coaching/resources",
        "GET /api/v1/orgs/{orgId}/coaching/sessions",
        "GET /api/v1/orgs/{orgId}/coaching/sessions/{coachSessionId}",
        "GET /api/v1/orgs/{orgId}/context",
        "GET /api/v1/orgs/{orgId}/files/{fileId}",
        "GET /api/v1/orgs/{orgId}/files/{fileId}/download-url",
        "GET /api/v1/orgs/{orgId}/fitness/assignments",
        "GET /api/v1/orgs/{orgId}/fitness/assignments/{workoutAssignmentId}",
        "GET /api/v1/orgs/{orgId}/fitness/checkins",
        "GET /api/v1/orgs/{orgId}/fitness/checkins/compare",
        "GET /api/v1/orgs/{orgId}/fitness/checkins/week/{week}",
        "GET /api/v1/orgs/{orgId}/fitness/checkins/{checkinId}",
        "GET /api/v1/orgs/{orgId}/fitness/clients",
        "GET /api/v1/orgs/{orgId}/fitness/clients/{membershipId}",
        "GET /api/v1/orgs/{orgId}/fitness/clients/{membershipId}/photos",
        "GET /api/v1/orgs/{orgId}/fitness/exercises",
        "GET /api/v1/orgs/{orgId}/fitness/exercises/{exerciseId}",
        "GET /api/v1/orgs/{orgId}/fitness/nutrition-plans",
        "GET /api/v1/orgs/{orgId}/fitness/nutrition-plans/{nutritionPlanId}",
        "GET /api/v1/orgs/{orgId}/fitness/nutrition-plans/{nutritionPlanId}/versions/{nutritionVersionId}",
        "GET /api/v1/orgs/{orgId}/fitness/nutrition/assignments",
        "GET /api/v1/orgs/{orgId}/fitness/nutrition/assignments/{nutritionAssignmentId}",
        "GET /api/v1/orgs/{orgId}/fitness/nutrition/logs",
        "GET /api/v1/orgs/{orgId}/fitness/nutrition/today",
        "GET /api/v1/orgs/{orgId}/fitness/plans",
        "GET /api/v1/orgs/{orgId}/fitness/plans/{planId}",
        "GET /api/v1/orgs/{orgId}/fitness/plans/{planId}/versions/{versionId}",
        "GET /api/v1/orgs/{orgId}/fitness/sessions",
        "GET /api/v1/orgs/{orgId}/fitness/sessions/{sessionId}",
        "GET /api/v1/orgs/{orgId}/fitness/workouts/today",
        "GET /api/v1/orgs/{orgId}/groups",
        "GET /api/v1/orgs/{orgId}/groups/{groupId}",
        "GET /api/v1/orgs/{orgId}/invitations",
        "GET /api/v1/orgs/{orgId}/members",
        "GET /api/v1/orgs/{orgId}/members/{memberId}",
        "GET /api/v1/orgs/{orgId}/messaging/contacts",
        "GET /api/v1/orgs/{orgId}/messaging/conversations",
        "GET /api/v1/orgs/{orgId}/messaging/conversations/{conversationId}",
        "GET /api/v1/orgs/{orgId}/messaging/conversations/{conversationId}/messages",
        "GET /api/v1/orgs/{orgId}/messaging/reports",
        "GET /api/v1/orgs/{orgId}/messaging/unread-count",
        "GET /api/v1/orgs/{orgId}/permissions",
        "GET /api/v1/orgs/{orgId}/progress/goals",
        "GET /api/v1/orgs/{orgId}/progress/groups/{groupId}/summary",
        "GET /api/v1/orgs/{orgId}/progress/metrics",
        "GET /api/v1/orgs/{orgId}/progress/records",
        "GET /api/v1/orgs/{orgId}/progress/summary",
        "GET /api/v1/orgs/{orgId}/roles",
        "GET /api/v1/orgs/{orgId}/tasks",
        "GET /api/v1/orgs/{orgId}/tasks/{taskId}",
        "GET /api/v1/orgs/{orgId}/tasks/{taskId}/comments",
        "GET /api/v1/orgs/{orgId}/tasks/{taskId}/history",
        "PATCH /api/v1/admin/categories/{key}",
        "PATCH /api/v1/admin/designs/{key}",
        "PATCH /api/v1/admin/modules/{key}",
        "PATCH /api/v1/me",
        "PATCH /api/v1/orgs/{orgId}",
        "PATCH /api/v1/orgs/{orgId}/coaching/assessment-templates/{templateId}",
        "PATCH /api/v1/orgs/{orgId}/coaching/notes/{noteId}",
        "PATCH /api/v1/orgs/{orgId}/coaching/sessions/{coachSessionId}",
        "PATCH /api/v1/orgs/{orgId}/fitness/exercises/{exerciseId}",
        "PATCH /api/v1/orgs/{orgId}/fitness/nutrition-plans/{nutritionPlanId}",
        "PATCH /api/v1/orgs/{orgId}/fitness/plans/{planId}",
        "PATCH /api/v1/orgs/{orgId}/groups/{groupId}",
        "PATCH /api/v1/orgs/{orgId}/progress/goals/{goalId}",
        "PATCH /api/v1/orgs/{orgId}/roles/{roleId}",
        "PATCH /api/v1/orgs/{orgId}/tasks/{taskId}",
        "PATCH /api/v1/orgs/{orgId}/tasks/{taskId}/comments/{commentId}",
        "POST /api/v1/admin/designs",
        "POST /api/v1/admin/designs/{key}/reset",
        "POST /api/v1/admin/email-templates/{key}/{locale}/preview",
        "POST /api/v1/admin/email-templates/{key}/{locale}/test",
        "POST /api/v1/admin/organizations/{organizationId}/activate",
        "POST /api/v1/admin/organizations/{organizationId}/suspend",
        "POST /api/v1/admin/platform-roles",
        "POST /api/v1/admin/users/{userId}/activate",
        "POST /api/v1/admin/users/{userId}/suspend",
        "POST /api/v1/auth/login",
        "POST /api/v1/auth/logout",
        "POST /api/v1/auth/logout-all",
        "POST /api/v1/auth/mfa/login",
        "POST /api/v1/auth/refresh",
        "POST /api/v1/auth/register",
        "POST /api/v1/auth/request-password-reset",
        "POST /api/v1/auth/resend-verification",
        "POST /api/v1/auth/reset-password",
        "POST /api/v1/auth/verify-email",
        "POST /api/v1/invitations/accept",
        "POST /api/v1/invitations/preview",
        "POST /api/v1/me/devices",
        "POST /api/v1/me/mfa/confirm",
        "POST /api/v1/me/mfa/disable",
        "POST /api/v1/me/mfa/enroll",
        "POST /api/v1/me/notifications/read-all",
        "POST /api/v1/me/notifications/{id}/read",
        "POST /api/v1/orgs",
        "POST /api/v1/orgs/{orgId}/assignments",
        "POST /api/v1/orgs/{orgId}/assignments/{assignmentId}/end",
        "POST /api/v1/orgs/{orgId}/coaching/assessment-templates",
        "POST /api/v1/orgs/{orgId}/coaching/assessments",
        "POST /api/v1/orgs/{orgId}/coaching/assessments/{assessmentId}/cancel",
        "POST /api/v1/orgs/{orgId}/coaching/assessments/{assessmentId}/submit",
        "POST /api/v1/orgs/{orgId}/coaching/notes",
        "POST /api/v1/orgs/{orgId}/coaching/resources",
        "POST /api/v1/orgs/{orgId}/coaching/sessions",
        "POST /api/v1/orgs/{orgId}/coaching/sessions/{coachSessionId}/cancel",
        "POST /api/v1/orgs/{orgId}/coaching/sessions/{coachSessionId}/complete",
        "POST /api/v1/orgs/{orgId}/files/uploads",
        "POST /api/v1/orgs/{orgId}/files/{fileId}/complete",
        "POST /api/v1/orgs/{orgId}/fitness/assignments/{workoutAssignmentId}/cancel",
        "POST /api/v1/orgs/{orgId}/fitness/checkins/{checkinId}/comments",
        "POST /api/v1/orgs/{orgId}/fitness/checkins/{checkinId}/review",
        "POST /api/v1/orgs/{orgId}/fitness/checkins/{checkinId}/submit",
        "POST /api/v1/orgs/{orgId}/fitness/exercises",
        "POST /api/v1/orgs/{orgId}/fitness/nutrition-plans",
        "POST /api/v1/orgs/{orgId}/fitness/nutrition-plans/{nutritionPlanId}/assignments",
        "POST /api/v1/orgs/{orgId}/fitness/nutrition-plans/{nutritionPlanId}/versions",
        "POST /api/v1/orgs/{orgId}/fitness/nutrition-plans/{nutritionPlanId}/versions/{nutritionVersionId}/publish",
        "POST /api/v1/orgs/{orgId}/fitness/nutrition/assignments/{nutritionAssignmentId}/cancel",
        "POST /api/v1/orgs/{orgId}/fitness/nutrition/logs/{mealLogId}/photos",
        "POST /api/v1/orgs/{orgId}/fitness/photos",
        "POST /api/v1/orgs/{orgId}/fitness/plans",
        "POST /api/v1/orgs/{orgId}/fitness/plans/{planId}/assignments",
        "POST /api/v1/orgs/{orgId}/fitness/plans/{planId}/versions",
        "POST /api/v1/orgs/{orgId}/fitness/plans/{planId}/versions/{versionId}/publish",
        "POST /api/v1/orgs/{orgId}/fitness/sessions",
        "POST /api/v1/orgs/{orgId}/fitness/sessions/{sessionId}/complete",
        "POST /api/v1/orgs/{orgId}/groups",
        "POST /api/v1/orgs/{orgId}/groups/{groupId}/members",
        "POST /api/v1/orgs/{orgId}/invitations",
        "POST /api/v1/orgs/{orgId}/invitations/{invitationId}/resend",
        "POST /api/v1/orgs/{orgId}/leave",
        "POST /api/v1/orgs/{orgId}/members/{memberId}/reactivate",
        "POST /api/v1/orgs/{orgId}/members/{memberId}/role",
        "POST /api/v1/orgs/{orgId}/members/{memberId}/suspend",
        "POST /api/v1/orgs/{orgId}/messaging/conversations",
        "POST /api/v1/orgs/{orgId}/messaging/conversations/{conversationId}/messages",
        "POST /api/v1/orgs/{orgId}/messaging/conversations/{conversationId}/messages/{messageId}/report",
        "POST /api/v1/orgs/{orgId}/messaging/conversations/{conversationId}/read",
        "POST /api/v1/orgs/{orgId}/messaging/reports/{reportId}/resolve",
        "POST /api/v1/orgs/{orgId}/progress/goals",
        "POST /api/v1/orgs/{orgId}/progress/goals/{goalId}/milestones",
        "POST /api/v1/orgs/{orgId}/progress/goals/{goalId}/milestones/{milestoneId}/achieve",
        "POST /api/v1/orgs/{orgId}/progress/metrics",
        "POST /api/v1/orgs/{orgId}/progress/records",
        "POST /api/v1/orgs/{orgId}/progress/records/{recordId}/void",
        "POST /api/v1/orgs/{orgId}/roles",
        "POST /api/v1/orgs/{orgId}/tasks",
        "POST /api/v1/orgs/{orgId}/tasks/{taskId}/assignees",
        "POST /api/v1/orgs/{orgId}/tasks/{taskId}/attachments",
        "POST /api/v1/orgs/{orgId}/tasks/{taskId}/comments",
        "POST /api/v1/orgs/{orgId}/tasks/{taskId}/status",
        "PUT /api/v1/admin/design-default",
        "PUT /api/v1/admin/email-templates/{key}/{locale}",
        "PUT /api/v1/admin/flags/{key}",
        "PUT /api/v1/admin/organizations/{organizationId}/design",
        "PUT /api/v1/admin/organizations/{organizationId}/flags/{key}",
        "PUT /api/v1/admin/settings/identity",
        "PUT /api/v1/admin/settings/logo",
        "PUT /api/v1/admin/settings/mail",
        "PUT /api/v1/me/design",
        "PUT /api/v1/me/notification-preferences",
        "PUT /api/v1/orgs/{orgId}/fitness/checkins/week/{week}",
        "PUT /api/v1/orgs/{orgId}/fitness/clients/{membershipId}/profile",
        "PUT /api/v1/orgs/{orgId}/fitness/nutrition-plans/{nutritionPlanId}/versions/{nutritionVersionId}/content",
        "PUT /api/v1/orgs/{orgId}/fitness/nutrition/logs",
        "PUT /api/v1/orgs/{orgId}/fitness/plans/{planId}/versions/{versionId}/content",
        "PUT /api/v1/orgs/{orgId}/fitness/sessions/{sessionId}/sets",
        "PUT /api/v1/orgs/{orgId}/messaging/conversations/{conversationId}/block",
        "PUT /api/v1/orgs/{orgId}/messaging/conversations/{conversationId}/mute",
      ]
    `);
    expect(res.body.components.schemas.RegisterDto.required).toEqual(expect.arrayContaining(['fullName', 'email', 'password', 'acceptTerms']));
  });
});
