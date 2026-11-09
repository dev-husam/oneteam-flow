/**
 * Stable machine-readable error codes shared by the API and every client.
 * Clients localize by code (English and Arabic); `ERROR_MESSAGES_EN` is only the fallback text
 * the API puts in `error.message`.
 */
export const ERROR_MESSAGES_EN = {
  VALIDATION_FAILED: 'Some fields are invalid.',
  UNAUTHENTICATED: 'You need to sign in to do that.',
  INVALID_CREDENTIALS: 'The email or password is incorrect.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  TOKEN_INVALID: 'The access token is not valid.',
  REFRESH_TOKEN_INVALID: 'Your session is no longer valid. Please sign in again.',
  SESSION_REVOKED: 'This session was signed out.',
  ACCOUNT_SUSPENDED: 'This account is suspended.',
  PHONE_ALREADY_REGISTERED: 'This phone number is already used by another account.',
  WEAK_PASSWORD: 'The password does not meet the security requirements.',
  CONSENT_REQUIRED: 'You must accept the terms and privacy policy to continue.',
  ONE_TIME_TOKEN_INVALID: 'This link is invalid or has expired.',
  FORBIDDEN: 'You are not allowed to do that.',
  FILE_TYPE_NOT_ALLOWED: 'This type of file is not allowed.',
  FILE_TOO_LARGE: 'This file is too large.',
  FILE_NOT_UPLOADED: 'The file has not been uploaded yet.',
  FILE_REJECTED: 'The file content does not match its type and was rejected.',
  MODULE_NOT_ENABLED: 'This feature is not enabled for the organization.',
  PLAN_VERSION_LOCKED: 'This plan version is published and can no longer be edited. Create a new version instead.',
  PLAN_INVALID: 'The workout plan is incomplete or has invalid values.',
  SESSION_COMPLETED: 'This workout is already finished.',
  CHECKIN_LOCKED: 'This check-in was already submitted and can no longer be changed.',
  CONTACT_NOT_ALLOWED: 'You cannot start a conversation with this person.',
  EMAIL_NOT_VERIFIED: 'Please verify your email address first.',
  ORGANIZATION_SUSPENDED: 'This organization is suspended.',
  ALREADY_IN_ORGANIZATION: 'This account already belongs to an organization. An account can belong to only one.',
  FEATURE_DISABLED: 'This feature is switched off.',
  SESSION_IN_PAST: 'A session cannot start in the past.',
  SESSION_NOT_PLANNED: 'Only a planned session can be changed.',
  SESSION_NOT_STARTED: 'A session can be marked as held once it has started.',
  ASSESSMENT_INVALID: 'The questions or answers are not valid.',
  ASSESSMENT_NOT_OPEN: 'This assessment is no longer waiting for answers.',
  DESIGN_INVALID: 'This design is not valid.',
  DESIGN_IN_USE: 'This design is the default or is used by an organization.',
  DESIGN_BUILT_IN: 'Built-in designs cannot be deleted.',
  SETTINGS_INVALID: 'Some settings are invalid.',
  TEMPLATE_INVALID: 'This e-mail template is not valid.',
  LOGO_INVALID: 'The logo must be a PNG, JPEG or WebP image of at most 64 KB.',
  CATEGORY_UNAVAILABLE: 'This business category is not available.',
  SLUG_TAKEN: 'This organization address is already taken.',
  SLUG_INVALID: 'This organization address is not allowed.',
  MFA_REQUIRED: 'Two-factor authentication is required for this action.',
  MFA_CODE_INVALID: 'The verification code is incorrect.',
  MFA_TOKEN_INVALID: 'The two-factor sign-in has expired. Please sign in again.',
  MFA_ALREADY_ENABLED: 'Two-factor authentication is already enabled.',
  MFA_NOT_ENABLED: 'Two-factor authentication is not enabled.',
  MFA_CANNOT_DISABLE: 'Two-factor authentication cannot be turned off for this account.',
  INVITATION_INVALID: 'This invitation is invalid or has expired.',
  INVITATION_EMAIL_MISMATCH: 'This invitation was sent to a different email address.',
  ALREADY_MEMBER: 'This person is already a member of the organization.',
  INVITATION_PENDING: 'There is already a pending invitation for this email address.',
  ROLE_INVALID: 'The selected role is not valid.',
  ROLE_IMMUTABLE: 'System roles cannot be changed.',
  ROLE_IN_USE: 'This role is assigned to members and cannot be deleted.',
  PRIVILEGE_ESCALATION: 'You cannot grant permissions or roles above your own.',
  LAST_OWNER: 'An organization must keep at least one owner.',
  MEMBER_RANK_TOO_HIGH: 'You cannot manage a member with an equal or higher role.',
  ASSIGNMENT_INVALID: 'This assignment is not valid.',
  ASSIGNMENT_EXISTS: 'This participant already has an active assignment of this kind.',
  GROUP_MEMBER_INVALID: 'Only active members of the organization can join a group.',
  SELF_ACTION_FORBIDDEN: 'You cannot do that to your own account.',
  PLATFORM_ROLE_INVALID: 'The selected platform role is not valid.',
  NOT_FOUND: 'We could not find what you asked for.',
  SESSION_NOT_FOUND: 'That session does not exist.',
  RATE_LIMITED: 'Too many requests. Please try again shortly.',
  TOO_MANY_LOGIN_ATTEMPTS: 'Too many failed sign-in attempts. Please try again later.',
  CSRF_REJECTED: 'The request origin is not allowed.',
  CONFLICT: 'The request conflicts with the current state.',
  INTERNAL_ERROR: 'Something went wrong on our side.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES_EN;

export const ERROR_CODES = Object.keys(ERROR_MESSAGES_EN) as ErrorCode[];

/** Shape of every error body returned by the API. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId: string;
  };
}
