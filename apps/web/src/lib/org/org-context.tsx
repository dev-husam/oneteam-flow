'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError, type GrantScope, type MyOrganization, type OrgContext } from '@pt/api-client';
import { useTranslations } from 'next-intl';
import { notFound, useParams } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { reportOrganizationDesign } from '@/lib/design/organization-design';

export interface OrgState {
  orgId: string;
  slug: string;
  context: OrgContext;
  /** Server-provided permissions (from /context). Hiding UI is a convenience: the API enforces every call. */
  can: (code: string) => boolean;
  scopeOf: (code: string) => GrantScope | undefined;
  /** Rank of the caller's role: used to hint which members are manageable. */
  rank: number;
  membershipId: string;
}

const OrgCtx = createContext<OrgState | null>(null);

export const MY_ORGS_KEY = ['my-organizations'] as const;
export const useMyOrganizations = () => useQuery({ queryKey: MY_ORGS_KEY, queryFn: () => api.me.organizations(), staleTime: 60_000 });
export const orgKey = (orgId: string, ...rest: unknown[]) => ['org', orgId, ...rest] as const;

function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40" />
    </div>
  );
}

/**
 * Resolves `/o/[orgSlug]` to an organization the caller belongs to, then loads their role, permissions,
 * modules and navigation. A slug the caller is not a member of is a plain 404, like on the server.
 */
export function OrgProvider({ children }: { children: ReactNode }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const mine = useMyOrganizations();
  const entry: MyOrganization | undefined = mine.data?.find((m) => m.organization.slug === orgSlug);
  const orgId = entry?.organization.id;

  const context = useQuery({
    queryKey: orgKey(orgId ?? 'none', 'context'),
    queryFn: () => api.org(orgId!).context(),
    enabled: Boolean(orgId),
    // A 404/403 here means access was lost; do not keep retrying.
    retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status < 500),
  });

  const value = useMemo<OrgState | null>(() => {
    if (!orgId || !context.data) return null;
    const grants = new Map(context.data.permissions.map((p) => [p.code, p.scope]));
    return {
      orgId,
      slug: orgSlug,
      context: context.data,
      can: (code) => grants.has(code),
      scopeOf: (code) => grants.get(code),
      rank: context.data.membership.role.rank,
      membershipId: context.data.membership.id,
    };
  }, [orgId, orgSlug, context.data]);

  // Tell the page which design this organization uses, and whether it lets people choose their own, while it is open.
  const orgDesign = context.data?.design ?? null;
  const personalAllowed = context.data?.features.user_design_choice !== false;
  useEffect(() => {
    if (!orgId || !context.data) return;
    reportOrganizationDesign({ design: orgDesign, personalAllowed });
    return () => reportOrganizationDesign(null);
  }, [orgId, context.data, orgDesign, personalAllowed]);

  if (mine.isPending) return <Loading />;
  if (mine.isError) return <ErrorAlert error={mine.error} />;
  if (!entry) notFound();
  if (context.isError) return <ErrorAlert error={context.error} />;
  if (!value) return <Loading />;
  return <OrgCtx.Provider value={value}>{children}</OrgCtx.Provider>;
}

export function useOrg(): OrgState {
  const ctx = useContext(OrgCtx);
  if (!ctx) throw new Error('useOrg must be used inside OrgProvider');
  return ctx;
}

/** Renders children only when the member holds the permission (any scope). */
export function Can({ permission, children, fallback = null }: { permission: string; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useOrg();
  return <>{can(permission) ? children : fallback}</>;
}

/** Localized label for a role: system roles use the category terminology (Trainer, Student…), custom roles their name. */
export function useRoleLabel() {
  const t = useTranslations();
  return useCallback(
    (role: { key: string; name: string; labelKey?: string | null }): string => {
      const key = role.labelKey as Parameters<typeof t>[0] | null | undefined;
      return key && !role.key.startsWith('custom-') && t.has(key) ? t(key) : role.name;
    },
    [t],
  );
}
