import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers/app.js';
import { discoverRoutes, type RouteInfo } from './helpers/routes.js';

describe('route inventory: access control is declared for every route', () => {
  let t: TestApp;
  let routes: RouteInfo[];
  beforeAll(async () => {
    t = await createTestApp();
    routes = discoverRoutes(t.app);
  });
  afterAll(async () => t.app.close());

  it('finds the routes (guards against a broken discovery silently passing everything)', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('every organization route is authenticated and declares @RequirePermission or @AnyMember', () => {
    const orgRoutes = routes.filter((r) => r.path.includes(':orgId'));
    expect(orgRoutes.length).toBeGreaterThanOrEqual(30);
    const offenders = orgRoutes.filter((r) => r.isPublic || (!r.anyMember && !(r.permission && r.permission.length > 0)));
    expect(offenders.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('every business-module route declares its @RequiresModule, and nothing else does', () => {
    const modules: Record<string, string> = { fitness: '/orgs/:orgId/fitness/', coaching: '/orgs/:orgId/coaching/' };
    const minimum: Record<string, number> = { fitness: 25, coaching: 20 };
    for (const [key, prefix] of Object.entries(modules)) {
      const own = routes.filter((r) => r.path.startsWith(prefix));
      expect(own.length, key).toBeGreaterThanOrEqual(minimum[key]!);
      expect(own.filter((r) => r.requiresModule !== key).map((r) => `${r.method} ${r.path}`), key).toEqual([]);
    }
    expect(routes.filter((r) => !Object.values(modules).some((p) => r.path.startsWith(p)) && r.requiresModule).map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('every /admin route is authenticated and declares a platform permission; no org route does', () => {
    const admin = routes.filter((r) => r.path.startsWith('/admin'));
    expect(admin.length).toBeGreaterThan(10);
    expect(admin.filter((r) => r.isPublic || !r.platformPermission).map((r) => `${r.method} ${r.path}`)).toEqual([]);
    expect(routes.filter((r) => !r.path.startsWith('/admin') && r.platformPermission)).toEqual([]);
  });

  it('the set of PUBLIC routes is explicit: adding one requires updating this list', () => {
    const publicRoutes = routes.filter((r) => r.isPublic).map((r) => `${r.method} ${r.path}`);
    expect(publicRoutes).toMatchInlineSnapshot(`
      [
        "POST /auth/login",
        "POST /auth/logout",
        "POST /auth/mfa/login",
        "POST /auth/refresh",
        "POST /auth/register",
        "POST /auth/request-password-reset",
        "POST /auth/resend-verification",
        "POST /auth/reset-password",
        "POST /auth/verify-email",
        "GET /config/logo",
        "GET /config/public",
        "GET /health/live",
        "GET /health/ready",
        "POST /invitations/preview",
        "GET /storage/download/:token",
        "PUT /storage/upload/:token",
      ]
    `);
  });

  it('organization routes never take the tenant from anywhere but the path', () => {
    for (const r of routes.filter((x) => x.path.includes(':orgId'))) {
      expect(r.path.match(/:orgId/g)).toHaveLength(1);
      expect(r.path.startsWith('/orgs/:orgId')).toBe(true);
    }
  });
});
