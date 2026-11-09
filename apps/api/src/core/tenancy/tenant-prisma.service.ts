import { Inject, Injectable } from '@nestjs/common';
import { requestContext, type TenantContext } from '../../common/context/request-context.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ROOT_MODELS, TENANT_MODELS } from './tenant-models.js';

const TENANT = new Set<string>(TENANT_MODELS);
const ROOT = new Set<string>(ROOT_MODELS);
/** Append-only tenant data: may be created and read inside a tenant context, never updated or deleted. */
const APPEND_ONLY = new Set<string>(['AuditLog']);
const APPEND_ONLY_READS = new Set(['findFirst', 'findMany', 'count']);

const FILTERED = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy',
  'findUnique', 'findUniqueOrThrow', 'update', 'delete', 'updateMany', 'updateManyAndReturn', 'deleteMany',
]);
const MODIFYING_DATA = new Set(['update', 'updateMany', 'updateManyAndReturn']);

export class TenantIsolationError extends Error {}

type Args = Record<string, unknown> | undefined;

function and(where: unknown, extra: Record<string, unknown>): Record<string, unknown> {
  return where ? { AND: [where, extra] } : extra;
}

/**
 * Unique-key operations must keep their unique field at the top level of `where`, so the tenant filter is
 * added next to it (Prisma's extended unique filters) instead of wrapping it. A foreign `organizationId` or
 * `id` supplied by the caller then simply fails to match: the row is "not found".
 */
function andUnique(where: unknown, extra: Record<string, unknown>): Record<string, unknown> {
  const w = { ...((where as Record<string, unknown> | undefined) ?? {}) };
  const existing = w.AND === undefined ? [] : Array.isArray(w.AND) ? w.AND : [w.AND];
  return { ...w, AND: [...existing, extra] };
}
const UNIQUE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete']);

function assertNoTenantFieldInUpdate(data: unknown, orgId: string): void {
  if (!data || typeof data !== 'object') return;
  const d = data as Record<string, unknown>;
  const org = d.organizationId;
  const flat = typeof org === 'object' && org !== null ? (org as { set?: unknown }).set : org;
  if (d.organization !== undefined || (flat !== undefined && flat !== orgId)) {
    throw new TenantIsolationError('Updates may not change or reference another organization');
  }
}

function withTenantOnCreate(data: unknown, orgId: string): Record<string, unknown> {
  const d = { ...(data as Record<string, unknown>) };
  if (d.organization !== undefined) throw new TenantIsolationError('Use organizationId implicitly: relation form is not allowed');
  if (d.organizationId !== undefined && d.organizationId !== orgId) {
    throw new TenantIsolationError('Cannot create rows for another organization');
  }
  d.organizationId = orgId;
  return d;
}

/**
 * Pure function applied to every operation of the scoped client (exported for unit tests).
 * Returns the arguments to execute, or throws TenantIsolationError.
 */
export function scopeArgs(model: string, operation: string, args: Args, orgId: string | undefined): Args {
  if (APPEND_ONLY.has(model)) {
    if (!orgId) throw new TenantIsolationError('Tenant-scoped query without a tenant context');
    const next: Record<string, unknown> = { ...(args ?? {}) };
    if (operation === 'create') {
      next.data = withTenantOnCreate(next.data, orgId);
      return next;
    }
    if (APPEND_ONLY_READS.has(operation)) {
      next.where = and(next.where, { organizationId: orgId });
      return next;
    }
    throw new TenantIsolationError(`Operation ${operation} is not allowed on append-only model ${model}`);
  }
  if (!TENANT.has(model) && !ROOT.has(model)) {
    throw new TenantIsolationError(`Model ${model} is not available through the tenant-scoped client`);
  }
  if (!orgId) throw new TenantIsolationError('Tenant-scoped query without a tenant context');

  const isRoot = ROOT.has(model);
  const scope = isRoot ? { id: orgId } : { organizationId: orgId };
  const next: Record<string, unknown> = { ...(args ?? {}) };

  if (FILTERED.has(operation)) {
    next.where = UNIQUE_OPS.has(operation) ? andUnique(next.where, scope) : and(next.where, scope);
    if (MODIFYING_DATA.has(operation) && !isRoot) assertNoTenantFieldInUpdate(next.data, orgId);
    return next;
  }

  if (isRoot) throw new TenantIsolationError(`Operation ${operation} on Organization is not allowed in a tenant context`);

  switch (operation) {
    case 'create':
      next.data = withTenantOnCreate(next.data, orgId);
      return next;
    case 'createMany':
    case 'createManyAndReturn':
      next.data = (Array.isArray(next.data) ? next.data : [next.data]).map((row) => withTenantOnCreate(row, orgId));
      return next;
    case 'upsert':
      next.where = andUnique(next.where, scope);
      next.create = withTenantOnCreate(next.create, orgId);
      assertNoTenantFieldInUpdate(next.update, orgId);
      return next;
    default:
      throw new TenantIsolationError(`Operation ${operation} is not allowed on the tenant-scoped client`);
  }
}

/**
 * The ONLY Prisma client organization-owned repositories may use. Every operation is rewritten by `scopeArgs`
 * so a missing `where` can never read or write another tenant's rows. (MySQL has no row-level security;
 * composite foreign keys are the second layer, tests the third.)
 */
export function createTenantClient(prisma: PrismaService) {
  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scoped = scopeArgs(model, operation, args as Args, requestContext.get()?.tenant?.orgId);
          return query(scoped as never);
        },
      },
    },
  });
}

@Injectable()
export class TenantPrismaService {
  readonly db: ReturnType<typeof createTenantClient>;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.db = createTenantClient(prisma);
  }
}

/**
 * Runs background work (jobs, event handlers, tests) inside an organization's tenant context.
 * The callback is awaited INSIDE the context: Prisma queries are lazy and would otherwise execute after the
 * context has ended when a query is returned without being awaited.
 */
export async function runInTenant<T>(tenant: TenantContext, fn: () => Promise<T> | T): Promise<T> {
  return requestContext.run({ requestId: `job-${tenant.orgId}`, tenant }, async () => await fn());
}
