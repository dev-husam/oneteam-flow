export interface NavItem {
  key: string;
  /** i18n key */
  labelKey: string;
  /** Path template; `{orgSlug}` is replaced by the client. */
  path: string;
  /** Item is shown only when the member holds this permission (any scope). */
  requiredPermission?: string;
  /** Item is shown only when the organization has this module enabled. */
  moduleKey?: string;
  /** Item is shown only while this feature flag is on for the organization. */
  featureKey?: string;
  /** Item is hidden from members who hold this permission (for example the client’s page from the coach). */
  hiddenWithPermission?: string;
}

/** Core navigation. Business modules append their own items from their manifest. */
export const CORE_NAVIGATION: readonly NavItem[] = [
  { key: 'overview', labelKey: 'nav.overview', path: '/o/{orgSlug}' },
  { key: 'members', labelKey: 'nav.members', path: '/o/{orgSlug}/members', requiredPermission: 'member.read' },
  { key: 'invitations', labelKey: 'nav.invitations', path: '/o/{orgSlug}/invitations', requiredPermission: 'invitation.read' },
  { key: 'tasks', labelKey: 'nav.tasks', path: '/o/{orgSlug}/tasks', requiredPermission: 'task.read' },
  { key: 'messages', labelKey: 'nav.messages', path: '/o/{orgSlug}/messages', requiredPermission: 'message.send', featureKey: 'messaging' },
  { key: 'message-reports', labelKey: 'nav.messageReports', path: '/o/{orgSlug}/message-reports', requiredPermission: 'message.moderate', featureKey: 'messaging' },
  { key: 'progress', labelKey: 'nav.progress', path: '/o/{orgSlug}/progress', requiredPermission: 'progress.read' },
  { key: 'groups', labelKey: 'nav.groups', path: '/o/{orgSlug}/groups', requiredPermission: 'group.read' },
  { key: 'roles', labelKey: 'nav.roles', path: '/o/{orgSlug}/roles', requiredPermission: 'role.read' },
  { key: 'audit', labelKey: 'nav.audit', path: '/o/{orgSlug}/audit', requiredPermission: 'audit.read' },
  { key: 'settings', labelKey: 'nav.settings', path: '/o/{orgSlug}/settings', requiredPermission: 'org.settings.update' },
];

export function visibleNavigation(
  items: readonly NavItem[],
  permissions: Readonly<Record<string, string>>,
  enabledModules: readonly string[],
  features: Readonly<Record<string, boolean>> = {},
): NavItem[] {
  return items.filter(
    (i) =>
      (!i.requiredPermission || i.requiredPermission in permissions) &&
      (!i.moduleKey || enabledModules.includes(i.moduleKey)) &&
      (!i.featureKey || features[i.featureKey] !== false) &&
      (!i.hiddenWithPermission || !(i.hiddenWithPermission in permissions)),
  );
}
