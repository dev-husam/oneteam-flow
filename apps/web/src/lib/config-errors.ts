import { ApiError } from '@pt/api-client';

/** Field problems from SETTINGS_INVALID / TEMPLATE_INVALID: `{ "appName.en": "required", accent: "contrast" }`. */
export function configFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const fields = (error.details as { fields?: unknown } | undefined)?.fields;
  return fields && typeof fields === 'object' && !Array.isArray(fields) ? (fields as Record<string, string>) : {};
}
