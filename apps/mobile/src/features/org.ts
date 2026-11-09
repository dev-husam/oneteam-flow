import { useQuery } from '@tanstack/react-query';
import { ApiError, type OrgContext } from '@pt/api-client';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';

export const MY_ORGS_KEY = ['my-organizations'] as const;
export const useMyOrganizations = () => useQuery({ queryKey: MY_ORGS_KEY, queryFn: () => api.me.organizations() });

/** Role, permissions, enabled modules and navigation of the active organization, loaded from the server. */
export function useOrgContext() {
  const orgId = usePrefs((s) => s.activeOrgId);
  const query = useQuery({
    queryKey: ['org', orgId, 'context'],
    queryFn: () => api.org(orgId!).context(),
    enabled: Boolean(orgId),
    // Losing access (removed, suspended organization) will not fix itself: do not keep retrying.
    retry: (count, e) => count < 2 && !(e instanceof ApiError && e.status < 500),
  });
  const ctx: OrgContext | undefined = query.data;
  const grants = new Set(ctx?.permissions.map((p) => p.code));
  return { ...query, orgId, context: ctx, can: (code: string) => grants.has(code) };
}
