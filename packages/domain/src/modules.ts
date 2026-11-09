import { COACHING_MODULE_KEY, COACHING_NAVIGATION, COACHING_PERMISSIONS, COACHING_ROLE_DEFAULTS, COACHING_SENSITIVE_PERMISSIONS } from './coaching.js';
import { FITNESS_METRICS, FITNESS_NAVIGATION, FITNESS_PERMISSIONS, FITNESS_ROLE_DEFAULTS, FITNESS_MODULE_KEY, FITNESS_SENSITIVE_PERMISSIONS } from './fitness.js';
import { CORE_NAVIGATION, type NavItem } from './navigation.js';
import { CORE_PERMISSIONS, type GrantScope, type PermissionDefinition } from './permissions.js';

/** What a business module contributes to the platform. The core reads manifests; it never imports module code. */
export interface BusinessModuleManifest {
  key: string;
  permissions: readonly PermissionDefinition[];
  /** Extra grants for system role templates, by role key. */
  roleDefaults: Readonly<Record<string, Readonly<Record<string, GrantScope>>>>;
  navigation: readonly NavItem[];
  /** Permissions for special-category data: not part of the owner/admin "everything" templates except for owners. */
  sensitivePermissions: readonly string[];
  /** System-wide measurement definitions the module registers. */
  metrics: readonly { key: string; unit: string; precision: number; higherIsBetter: boolean | null; names: { en: string; ar: string } }[];
}

export const MODULE_MANIFESTS: readonly BusinessModuleManifest[] = [
  { key: FITNESS_MODULE_KEY, permissions: FITNESS_PERMISSIONS, roleDefaults: FITNESS_ROLE_DEFAULTS, navigation: FITNESS_NAVIGATION, sensitivePermissions: FITNESS_SENSITIVE_PERMISSIONS, metrics: FITNESS_METRICS },
  { key: COACHING_MODULE_KEY, permissions: COACHING_PERMISSIONS, roleDefaults: COACHING_ROLE_DEFAULTS, navigation: COACHING_NAVIGATION, sensitivePermissions: COACHING_SENSITIVE_PERMISSIONS, metrics: [] },
];

/** Core permissions plus every module's. */
export const ALL_PERMISSIONS: readonly PermissionDefinition[] = [...CORE_PERMISSIONS, ...MODULE_MANIFESTS.flatMap((m) => m.permissions)];
export const ALL_PERMISSION_CODES: readonly string[] = ALL_PERMISSIONS.map((p) => p.code);

export const SENSITIVE_PERMISSIONS: readonly string[] = MODULE_MANIFESTS.flatMap((m) => m.sensitivePermissions);

/** Core navigation with the enabled modules' items placed after "progress". */
export function navigationFor(enabledModules: readonly string[]): NavItem[] {
  const moduleItems = MODULE_MANIFESTS.filter((m) => enabledModules.includes(m.key)).flatMap((m) => m.navigation);
  const at = CORE_NAVIGATION.findIndex((i) => i.key === 'progress');
  return [...CORE_NAVIGATION.slice(0, at + 1), ...moduleItems, ...CORE_NAVIGATION.slice(at + 1)];
}
