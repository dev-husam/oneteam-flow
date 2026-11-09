/**
 * Permission catalog: the single source of truth for what can be granted.
 * The API syncs it into the `permissions` table at boot; web and mobile import the codes for `<Can>` checks.
 * Business modules add their own definitions through their manifest (Phase 6: fitness.*).
 */
export type GrantScope = 'OWN' | 'ASSIGNED' | 'ORG' | 'ALL';
export type PermissionScopeType = 'PLATFORM' | 'ORGANIZATION';

export interface PermissionDefinition {
  code: string;
  scopeType: PermissionScopeType;
  group: string;
  moduleKey?: string;
  description: string;
  /** Scopes a role may grant for this permission. */
  allowedScopes: readonly GrantScope[];
}

export const orgPermission = (
  code: string,
  group: string,
  description: string,
  allowedScopes: readonly GrantScope[] = ['ORG'],
): PermissionDefinition => ({ code, scopeType: 'ORGANIZATION', group, description, allowedScopes });

const platform = (code: string, group: string, description: string): PermissionDefinition => ({
  code,
  scopeType: 'PLATFORM',
  group,
  description,
  allowedScopes: ['ALL'],
});

export const CORE_PERMISSIONS: readonly PermissionDefinition[] = [
  orgPermission('org.settings.update', 'organization', 'Change organization name, contact data, timezone and language'),
  orgPermission('member.read', 'members', 'See members', ['OWN', 'ASSIGNED', 'ORG']),
  orgPermission('member.invite', 'members', 'Invite people (only to roles ranked below your own)'),
  orgPermission('member.update_role', 'members', 'Change the role of a member ranked below you'),
  orgPermission('member.suspend', 'members', 'Suspend and reactivate members ranked below you'),
  orgPermission('member.remove', 'members', 'Remove members ranked below you'),
  orgPermission('invitation.read', 'members', 'See invitations', ['OWN', 'ORG']),
  orgPermission('invitation.manage', 'members', 'Resend and revoke invitations', ['OWN', 'ORG']),
  orgPermission('role.read', 'roles', 'See roles and permissions'),
  orgPermission('role.manage', 'roles', 'Create, edit and delete custom roles'),
  orgPermission('group.read', 'groups', 'See groups', ['OWN', 'ORG']),
  orgPermission('group.manage', 'groups', 'Create groups and manage their members', ['OWN', 'ORG']),
  orgPermission('assignment.read', 'assignments', 'See practitioner-participant assignments', ['OWN', 'ORG']),
  orgPermission('assignment.manage', 'assignments', 'Assign participants to practitioners'),
  orgPermission('audit.read', 'audit', 'Read the organization audit log'),

  orgPermission('task.read', 'tasks', 'See tasks', ['OWN', 'ASSIGNED', 'ORG']),
  orgPermission('task.create', 'tasks', 'Create tasks and assign them', ['OWN', 'ASSIGNED', 'ORG']),
  orgPermission('task.manage', 'tasks', 'Edit, cancel and delete tasks', ['OWN', 'ORG']),
  orgPermission('task.update_status', 'tasks', 'Update the progress of tasks assigned to you', ['OWN']),
  orgPermission('task.comment', 'tasks', 'Comment on tasks', ['OWN', 'ASSIGNED', 'ORG']),
  orgPermission('progress.read', 'progress', 'See progress records and goals', ['OWN', 'ASSIGNED', 'ORG']),
  orgPermission('progress.record', 'progress', 'Record measurements', ['OWN', 'ASSIGNED', 'ORG']),
  orgPermission('goal.manage', 'progress', 'Create goals and milestones', ['OWN', 'ASSIGNED', 'ORG']),
  orgPermission('metric.manage', 'progress', 'Define custom metrics'),
  orgPermission('file.upload', 'files', 'Upload files'),
  orgPermission('activity.read', 'activity', 'See the activity feed', ['OWN', 'ASSIGNED', 'ORG']),
  orgPermission('message.moderate', 'messaging', 'Review reported messages and resolve the reports'),
  orgPermission('message.send', 'messaging', 'Message people you work with (assigned people only, or anyone in the organization)', ['ASSIGNED', 'ORG']),

  platform('platform.stats.read', 'platform', 'See platform statistics'),
  platform('platform.user.read', 'platform', 'See all users'),
  platform('platform.user.suspend', 'platform', 'Suspend and activate users'),
  platform('platform.organization.read', 'platform', 'See all organizations'),
  platform('platform.organization.suspend', 'platform', 'Suspend and activate organizations'),
  platform('platform.category.manage', 'platform', 'Enable and disable business categories'),
  platform('platform.module.manage', 'platform', 'Enable and disable business modules'),
  platform('platform.role.manage', 'platform', 'Grant and revoke platform roles'),
  platform('platform.audit.read', 'platform', 'Read the platform audit log'),
  platform('platform.flag.manage', 'platform', 'Change feature flags and per-organization overrides'),
  platform('platform.settings.manage', 'platform', 'Change app identity, theme, logo and mail branding'),
  platform('platform.template.manage', 'platform', 'Edit e-mail templates'),
];

export const PERMISSION_CODES = CORE_PERMISSIONS.map((p) => p.code);
