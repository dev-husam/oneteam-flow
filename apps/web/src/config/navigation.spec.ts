import { describe, expect, it } from 'vitest';
import { LayoutDashboard } from 'lucide-react';
import { EMPTY_CONTEXT, visibleNavigation, type NavItem } from './navigation';

const items: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'profile', href: '/x', icon: LayoutDashboard, permission: 'task.create' },
  { key: 'security', href: '/y', icon: LayoutDashboard, module: 'fitness' },
];

describe('visibleNavigation', () => {
  it('shows only ungated items without context', () => {
    expect(visibleNavigation(items, EMPTY_CONTEXT).map((i) => i.key)).toEqual(['dashboard']);
  });

  it('shows items whose permission and module are granted', () => {
    const ctx = { permissions: new Set(['task.create']), modules: new Set(['fitness']) };
    expect(visibleNavigation(items, ctx)).toHaveLength(3);
  });

  it('hides a module item when the module is not enabled', () => {
    const ctx = { permissions: new Set(['task.create']), modules: new Set<string>() };
    expect(visibleNavigation(items, ctx).map((i) => i.key)).toEqual(['dashboard', 'profile']);
  });
});
