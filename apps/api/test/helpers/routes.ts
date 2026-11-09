import { RequestMethod } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IS_PUBLIC } from '../../src/common/decorators/public.decorator.js';
import { ANY_MEMBER, REQUIRES_MODULE, REQUIRE_PERMISSION, REQUIRE_PLATFORM_PERMISSION } from '../../src/core/rbac/decorators.js';

export interface RouteInfo {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Express-style template under /api/v1, e.g. /orgs/:orgId/members/:memberId */
  path: string;
  isPublic: boolean;
  permission?: string[];
  anyMember: boolean;
  platformPermission?: string;
  /** Business module the route belongs to (guarded by @RequiresModule). */
  requiresModule?: string;
}

const METHODS: Record<number, RouteInfo['method']> = {
  [RequestMethod.GET]: 'GET', [RequestMethod.POST]: 'POST', [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE', [RequestMethod.PATCH]: 'PATCH',
};

/** Every HTTP route registered in the application, with its declared access metadata. */
export function discoverRoutes(app: NestExpressApplication): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const wrapper of app.get(DiscoveryService).getControllers()) {
    const ctrl = wrapper.metatype as (new (...a: never[]) => unknown) | null;
    if (!ctrl) continue;
    const base = Reflect.getMetadata('path', ctrl) as string | undefined;
    if (base === undefined) continue;
    for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
      const handler = (ctrl.prototype as Record<string, unknown>)[name] as object;
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const subPath = Reflect.getMetadata('path', handler) as string | undefined;
      const method = Reflect.getMetadata('method', handler) as number | undefined;
      if (subPath === undefined || method === undefined) continue;
      const meta = <T>(key: string) => (Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, ctrl)) as T | undefined;
      routes.push({
        method: METHODS[method]!,
        path: '/' + [base, subPath].map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/'),
        isPublic: meta<boolean>(IS_PUBLIC) === true,
        permission: meta<string[]>(REQUIRE_PERMISSION),
        anyMember: meta<boolean>(ANY_MEMBER) === true,
        platformPermission: meta<string>(REQUIRE_PLATFORM_PERMISSION),
        requiresModule: meta<string>(REQUIRES_MODULE),
      });
    }
  }
  return routes.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
}
