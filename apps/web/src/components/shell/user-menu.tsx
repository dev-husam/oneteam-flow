'use client';

import { ChevronDown, KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { usePlatformAccess } from '@/lib/use-platform-access';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

export function UserMenu() {
  const t = useTranslations('shell');
  const nav = useTranslations('nav');
  const { user, logout } = useAuth();
  const access = usePlatformAccess();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
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

  if (!user) return null;

  const signOut = async () => {
    setLeaving(true);
    await logout().catch(() => undefined);
    router.replace('/login?reason=signedOut');
  };

  const itemClass = 'flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('userMenu')}
        className="flex items-center gap-2 rounded-md p-1 ps-1 pe-2 hover:bg-surface-2"
      >
        <span className="grid size-8 place-items-center rounded-full bg-selection text-xs font-semibold text-link">{initials(user.fullName)}</span>
        <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">{user.fullName}</span>
        <ChevronDown className="size-4 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="anim-pop absolute end-0 top-full z-40 mt-2 w-64 rounded-md border border-line bg-surface p-1.5 shadow-lg">
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            <p className="text-xs text-muted">{t('signedInAs')}</p>
            <p className="ltr-isolate truncate text-sm font-medium">{user.email}</p>
          </div>
          <div className="py-1.5">
            <Link role="menuitem" href="/profile" className={itemClass} onClick={() => setOpen(false)}>
              <UserRound className="size-4" aria-hidden /> {nav('profile')}
            </Link>
            <Link role="menuitem" href="/security" className={itemClass} onClick={() => setOpen(false)}>
              <ShieldCheck className="size-4" aria-hidden /> {nav('security')}
            </Link>
            {access.data?.isPlatformStaff && (
              <Link role="menuitem" href="/admin" className={itemClass} onClick={() => setOpen(false)}>
                <KeyRound className="size-4" aria-hidden /> {nav('admin')}
              </Link>
            )}
          </div>
          <button type="button" role="menuitem" onClick={signOut} disabled={leaving} className={`${itemClass} border-t border-line pt-2.5 text-danger hover:text-danger`}>
            <LogOut className="size-4 rtl:rotate-180" aria-hidden /> {leaving ? t('signingOut') : t('signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
