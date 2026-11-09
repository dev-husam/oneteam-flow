import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from '@pt/domain';

export const REQUIRE_PERMISSION = 'rbac:requirePermission';
export const ANY_MEMBER = 'rbac:anyMember';
export const REQUIRE_PLATFORM_PERMISSION = 'rbac:requirePlatformPermission';

/** Organization route: the caller must hold ALL listed permissions (any scope; the service applies the scope). */
export const RequirePermission = (...codes: string[]) => SetMetadata(REQUIRE_PERMISSION, codes);
/** Organization route open to every active member (e.g. the member's own context). */
export const AnyMember = () => SetMetadata(ANY_MEMBER, true);
/** Platform route (/admin/*): needs a platform role holding this permission, MFA verified. */
export const RequirePlatformPermission = (code: string) => SetMetadata(REQUIRE_PLATFORM_PERMISSION, code);

export const REQUIRES_FEATURE = 'rbac:requiresFeature';
/** Route tied to a feature flag (see FEATURE_FLAGS): refused with FEATURE_DISABLED while the flag is off for the organization. */
export const RequiresFeature = (key: FeatureKey) => SetMetadata(REQUIRES_FEATURE, key);

export const REQUIRES_MODULE = 'rbac:requiresModule';
/**
 * Organization route that belongs to a business module (e.g. 'fitness'): refused with MODULE_NOT_ENABLED unless the
 * organization has the module enabled AND the platform has not disabled it. Combine with @RequirePermission.
 */
export const RequiresModule = (key: string) => SetMetadata(REQUIRES_MODULE, key);
