/**
 * Feature flags: the single list of switchable features. The API syncs it into `feature_flags` at boot (new
 * flags are inserted with their default; a value an administrator already set is never overwritten).
 * `ORGANIZATION` flags can also be overridden for one organization from the admin console; `PLATFORM` flags are
 * about things that happen before anyone belongs to an organization (sign-up, creating an organization).
 */
export type FeatureScope = 'PLATFORM' | 'ORGANIZATION';

export interface FeatureDefinition {
  key: string;
  scope: FeatureScope;
  defaultEnabled: boolean;
  group: 'access' | 'collaboration' | 'fitness' | 'notifications' | 'administration';
  /** Shown in the admin console; English only (the console is an operator tool). */
  description: string;
}

export const FEATURE_FLAGS = [
  { key: 'registration', scope: 'PLATFORM', defaultEnabled: true, group: 'access', description: 'Anyone can create an account. Off: only people with a pending invitation can.' },
  { key: 'organization_creation', scope: 'PLATFORM', defaultEnabled: true, group: 'access', description: 'Accounts without an organization can create one.' },
  { key: 'messaging', scope: 'ORGANIZATION', defaultEnabled: true, group: 'collaboration', description: 'Private one-to-one messages, including live delivery and reports.' },
  { key: 'user_design_choice', scope: 'ORGANIZATION', defaultEnabled: true, group: 'administration', description: 'People can pick their own design (among the designs an administrator made available). Off for an organization: its members always see the organization’s design.' },
  { key: 'custom_roles', scope: 'ORGANIZATION', defaultEnabled: false, group: 'administration', description: 'Owners can create their own roles besides owner, trainer and client.' },
  { key: 'progress_photos', scope: 'ORGANIZATION', defaultEnabled: true, group: 'fitness', description: 'Weekly check-in photos (special-category data).' },
  { key: 'reminders', scope: 'ORGANIZATION', defaultEnabled: true, group: 'fitness', description: 'Automatic check-in reminders.' },
  { key: 'push_notifications', scope: 'ORGANIZATION', defaultEnabled: true, group: 'notifications', description: 'Push notifications to phones.' },
  { key: 'email_notifications', scope: 'ORGANIZATION', defaultEnabled: true, group: 'notifications', description: 'Notification e-mails (account e-mails such as password reset are never switched off).' },
] as const satisfies readonly FeatureDefinition[];

export type FeatureKey = (typeof FEATURE_FLAGS)[number]['key'];
export const FEATURE_KEYS: readonly FeatureKey[] = FEATURE_FLAGS.map((f) => f.key);
export const ORG_FEATURE_KEYS: readonly FeatureKey[] = FEATURE_FLAGS.filter((f) => f.scope === 'ORGANIZATION').map((f) => f.key);
export const PLATFORM_FEATURE_KEYS: readonly FeatureKey[] = FEATURE_FLAGS.filter((f) => f.scope === 'PLATFORM').map((f) => f.key);

export const isFeatureKey = (key: string): key is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(key);
export const featureDefinition = (key: FeatureKey): FeatureDefinition => FEATURE_FLAGS.find((f) => f.key === key)!;

/** An organization override wins over the platform value, but only for flags that allow overrides. */
export function effectiveFeature(key: FeatureKey, platformValue: boolean, override?: boolean | null): boolean {
  if (override === undefined || override === null) return platformValue;
  return featureDefinition(key).scope === 'ORGANIZATION' ? override : platformValue;
}

export type FeatureMap = Record<FeatureKey, boolean>;
