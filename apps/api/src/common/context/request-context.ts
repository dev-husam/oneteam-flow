import { AsyncLocalStorage } from 'node:async_hooks';
import type { GrantScope } from '@pt/domain';

/** Who the caller is inside one organization. Built by OrgContextGuard from the database, never from the token. */
export interface TenantContext {
  orgId: string;
  membershipId: string;
  roleId: string;
  roleKey: string;
  roleRank: number;
  grants: Readonly<Record<string, GrantScope>>;
}

/** Per-request data available anywhere without passing it around. */
export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  tenant?: TenantContext;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContext = {
  run: <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn),
  get: (): RequestContext | undefined => storage.getStore(),
  requestId: (): string => storage.getStore()?.requestId ?? 'no-request',
  setUser(userId: string, sessionId: string): void {
    const ctx = storage.getStore();
    if (ctx) {
      ctx.userId = userId;
      ctx.sessionId = sessionId;
    }
  },
  setTenant(tenant: TenantContext): void {
    const ctx = storage.getStore();
    if (ctx) ctx.tenant = tenant;
  },
  /** Tenant of the current request; throws when called outside an organization-scoped request. */
  tenant(): TenantContext {
    const tenant = storage.getStore()?.tenant;
    if (!tenant) throw new Error('No tenant context: this code must run inside an organization-scoped request or runInTenant()');
    return tenant;
  },
};
