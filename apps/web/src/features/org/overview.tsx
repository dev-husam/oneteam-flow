'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Shield, UserPlus, Users, UsersRound } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { orgKey, useOrg, useRoleLabel } from '@/lib/org/org-context';
import { AuditList } from './audit-list';

const SHORTCUTS = [
  { permission: 'member.invite', href: 'invitations', icon: UserPlus, key: 'invite' },
  { permission: 'member.read', href: 'members', icon: Users, key: 'members' },
  { permission: 'group.read', href: 'groups', icon: UsersRound, key: 'groups' },
  { permission: 'role.read', href: 'roles', icon: Shield, key: 'roles' },
] as const;

export function OrgOverview() {
  const t = useTranslations('orgs');
  const format = useFormatter();
  const roleLabel = useRoleLabel();
  const { orgId, slug, context, can } = useOrg();
  const org = context.organization;
  const shortcuts = SHORTCUTS.filter((s) => can(s.permission));

  const members = useQuery({ queryKey: orgKey(orgId, 'members', 'overview'), queryFn: () => api.org(orgId).members.list({ limit: 100 }), enabled: can('member.read') });
  const active = members.data?.data.filter((m) => m.status === 'ACTIVE').length;
  const pending = useQuery({ queryKey: orgKey(orgId, 'invitations', 'pending-count'), queryFn: () => api.org(orgId).invitations.list({ status: 'PENDING', limit: 100 }), enabled: can('invitation.read') });

  return (
    <>
      <PageHeader title={org.name} description={t('overviewSubtitle', { role: roleLabel(context.membership.role) })} actions={<Badge tone="accent">{t(`category.${org.categoryKey}` as 'category.fitness')}</Badge>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="anim-rise" style={{ ['--i' as string]: 0 }}>
          <CardBody>
            <p className="text-sm text-muted">{t('statMembers')}</p>
            {members.isPending && can('member.read') ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1 text-3xl font-semibold">{active === undefined ? '—' : format.number(active)}</p>}
            {members.data?.meta.nextCursor && <p className="text-xs text-muted">{t('atLeast')}</p>}
          </CardBody>
        </Card>
        <Card className="anim-rise" style={{ ['--i' as string]: 1 }}>
          <CardBody>
            <p className="text-sm text-muted">{t('statPending')}</p>
            {pending.isPending && can('invitation.read') ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1 text-3xl font-semibold">{pending.data ? format.number(pending.data.data.length) : '—'}</p>}
          </CardBody>
        </Card>
        <Card className="anim-rise" style={{ ['--i' as string]: 2 }}>
          <CardBody>
            <p className="text-sm text-muted">{t('statModules')}</p>
            <p className="mt-1 text-3xl font-semibold">{format.number(context.enabledModules.length)}</p>
            <p className="text-xs text-muted">{context.enabledModules.join(', ') || t('noModules')}</p>
          </CardBody>
        </Card>
      </div>

      {shortcuts.length > 0 && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {shortcuts.map(({ href, icon: Icon, key }, i) => (
            <Link key={key} href={`/o/${slug}/${href}`} className="anim-rise group flex items-center gap-4 rounded-lg border border-line bg-surface p-4 shadow-sm hover:border-selection-line" style={{ ['--i' as string]: i + 3 }}>
              <span className="grid size-10 place-items-center rounded-md bg-selection text-link">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t(`shortcut.${key}.title`)}</span>
                <span className="block text-sm text-muted">{t(`shortcut.${key}.body`)}</span>
              </span>
              <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
            </Link>
          ))}
        </div>
      )}

      {can('audit.read') && (
        <Card className="anim-rise mt-5">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t('recentActivity')}</CardTitle>
            <Link href={`/o/${slug}/audit`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {t('viewAll')}
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            <AuditList limit={6} compact />
          </CardBody>
        </Card>
      )}
    </>
  );
}
