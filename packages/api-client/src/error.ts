import type { ApiErrorBody, ErrorCode } from '@pt/domain';

/** Codes the client invents itself (the server never sends these). */
export type ClientErrorCode = 'NETWORK_ERROR' | 'UNKNOWN';

export interface FieldIssue {
  field: string;
  rules: string[];
}

/** The one error type thrown by the client. Pages localize it by `code`. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | ClientErrorCode,
    readonly status: number,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }

  /** Field-level validation problems from VALIDATION_FAILED, if any. */
  get fields(): FieldIssue[] {
    const d = this.details as { fields?: FieldIssue[] } | undefined;
    return Array.isArray(d?.fields) ? d.fields : [];
  }

  /** Per-path problems from PLAN_INVALID (e.g. path "days[0].exercises[1].repsMax", rule "repsOrder"). */
  get issues(): { path: string; rule: string }[] {
    const d = this.details as { issues?: { path: string; rule: string }[] } | undefined;
    return Array.isArray(d?.issues) ? d.issues : [];
  }

  static fromBody(status: number, body: unknown): ApiError {
    const err = (body as Partial<ApiErrorBody> | undefined)?.error;
    if (err && typeof err.code === 'string') {
      return new ApiError(err.code, status, err.details, err.requestId);
    }
    return new ApiError('UNKNOWN', status);
  }
}
