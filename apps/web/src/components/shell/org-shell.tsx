'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { orgNavIcon } from '@/config/org-navigation';
import { Link } from '@/i18n/navigation';
import { useMyOrganizations, useOrg, useRoleLabel } from '@/lib/org/org-context';
import { RealtimeProvider, useUnreadMessages } from '@/features/messaging/realtime-provider';
import { Shell, type ShellNavItem } from './shell';

/** Organization switcher in the sidebar: current organization and role, other organizations, create new. */
function OrgSwitcher() {
  const t = useTranslations('orgs');
  const { slug, context } = useOrg();
  const roleLabel = useRoleLabel();
  const mine = useMyOrganizations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('switch')}
        className="flex w-full items-center gap-2 rounded-md bg-sidebar-hover px-3 py-2 text-start text-white hover:bg-sidebar-active"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{context.organization.name}</span>
          <span className="block truncate text-xs text-sidebar-muted">{roleLabel(context.membership.role)}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-sidebar-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="anim-pop absolute inset-x-0 top-full z-40 mt-1.5 rounded-md border border-line bg-surface p-1.5 text-ink shadow-lg">
          {(mine.data ?? []).map((m) => (
            <Link
              key={m.organization.id}
              role="menuitem"
              href={`/o/${m.organization.slug}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-sm px-2.5 py-2 text-sm hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1 truncate">{m.organization.name}</span>
              {m.organization.slug === slug && <Check className="size-4 text-link" aria-hidden />}
            </Link>
          ))}
          <div className="mt-1 border-t border-line pt-1">
            <Link role="menuitem" href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2">
              {t('allOrganizations')}
            </Link>
            <Link role="menuitem" href="/organizations/new" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2">
              <Plus className="size-4" aria-hidden /> {t('create')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Frame for /o/[orgSlug]. The menu is exactly what the server returned for this member
 * (permissions and enabled modules already applied), so a new module appears here without a web change.
 */
export function OrgShell({ children }: { children: ReactNode }) {
  return (
    <RealtimeProvider>
      <OrgFrame>{children}</OrgFrame>
    </RealtimeProvider>
  );
}

function OrgFrame({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { slug, context } = useOrg();
  const unread = useUnreadMessages();
  const items: ShellNavItem[] = context.navigation.map((n) => ({
    key: n.key,
    href: n.path.replace('{orgSlug}', slug),
    icon: orgNavIcon(n.key),
    label: t.has(n.labelKey as Parameters<typeof t>[0]) ? t(n.labelKey as Parameters<typeof t>[0]) : n.key,
    exact: n.key === 'overview',
    badge: n.key === 'messages' ? unread : undefined,
  }));
  return (
    <Shell items={items} top={<OrgSwitcher />}>
      {children}
    </Shell>
  );
}
