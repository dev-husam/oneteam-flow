import { LayoutDashboard, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';

/**
 * Navigation is data, filtered by what the signed-in user may see. Today every item is account-level;
 * from Phase 2 the context comes from GET /orgs/:orgId/me/context (permissions + enabled modules) and
 * module routes (e.g. fitness) are declared here with `permission` / `module`. The server still enforces access.
 */
export interface NavItem {
  key: 'dashboard' | 'profile' | 'security';
  href: string;
  icon: LucideIcon;
  permission?: string;
  module?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'profile', href: '/profile', icon: UserRound },
  { key: 'security', href: '/security', icon: ShieldCheck },
];

export interface AccessContext {
  permissions: ReadonlySet<string>;
  modules: ReadonlySet<string>;
}

export const EMPTY_CONTEXT: AccessContext = { permissions: new Set(), modules: new Set() };

export function visibleNavigation(items: NavItem[], ctx: AccessContext): NavItem[] {
  return items.filter(
    (item) => (!item.permission || ctx.permissions.has(item.permission)) && (!item.module || ctx.modules.has(item.module)),
  );
}
