import { Activity, Building2, KeyRound, LayoutDashboard, Mail, Palette, ScrollText, Settings2, Shapes, ToggleRight, Users, type LucideIcon } from 'lucide-react';

export interface AdminNavItem {
  key: 'overview' | 'users' | 'organizations' | 'catalog' | 'features' | 'designs' | 'settings' | 'emailTemplates' | 'roles' | 'audit' | 'health';
  href: string;
  icon: LucideIcon;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { key: 'overview', href: '/admin', icon: LayoutDashboard },
  { key: 'users', href: '/admin/users', icon: Users },
  { key: 'organizations', href: '/admin/organizations', icon: Building2 },
  { key: 'catalog', href: '/admin/catalog', icon: Shapes },
  { key: 'features', href: '/admin/features', icon: ToggleRight },
  { key: 'designs', href: '/admin/designs', icon: Palette },
  { key: 'settings', href: '/admin/settings', icon: Settings2 },
  { key: 'emailTemplates', href: '/admin/email-templates', icon: Mail },
  { key: 'roles', href: '/admin/roles', icon: KeyRound },
  { key: 'audit', href: '/admin/audit', icon: ScrollText },
  { key: 'health', href: '/admin/health', icon: Activity },
];
