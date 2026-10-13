import { ForbiddenError, isCoreError, type ErrorCode } from '@tt/core';

export { ForbiddenError };

/** Raised when a request needs a signed-in user and has none. */
export class UnauthenticatedError extends Error {
  readonly code = 'unauthenticated';

  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

export const CORE_STATUS: Readonly<Record<ErrorCode, number>> = {
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  conflict: 409,
  audit_failed: 500,
};

export interface HttpFailure {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  /** Log the original error server-side. */
  readonly log: boolean;
}

const INTERNAL: HttpFailure = { status: 500, code: 'internal_error', message: 'Internal server error.', log: true };

interface FastifyLikeError {
  readonly statusCode?: unknown;
  readonly validation?: readonly { readonly instancePath?: string; readonly message?: string }[];
  readonly message?: unknown;
}

const describeValidation = (issues: NonNullable<FastifyLikeError['validation']>): string =>
  issues.map((issue) => `${(issue.instancePath ?? '').replace(/^\//, '').replaceAll('/', '.') || 'request'}: ${issue.message ?? 'invalid'}`).join('; ');

const clientStatusCode = (error: FastifyLikeError): number | null =>
  typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : null;

const CODE_BY_STATUS: Readonly<Record<number, string>> = {
  400: 'bad_request',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
};

/** Pure mapping from anything thrown to the status, code and safe message of the response. */
export function toHttpFailure(error: unknown): HttpFailure {
  if (isCoreError(error)) {
    const status = CORE_STATUS[error.code];
    if (status >= 500) return { ...INTERNAL, code: error.code, message: error.message };
    const issues = 'issues' in error && Array.isArray(error.issues) ? (error.issues as { path: string; message: string }[]) : [];
    const detail = issues.map((issue) => `${issue.path || 'input'}: ${issue.message}`).join('; ');
    return { status, code: error.code, message: detail || error.message, log: false };
  }
  if (error instanceof UnauthenticatedError) return { status: 401, code: error.code, message: error.message, log: false };
  if (typeof error !== 'object' || error === null) return INTERNAL;
  const candidate = error as FastifyLikeError;
  if (candidate.validation) {
    return { status: 422, code: 'validation_failed', message: describeValidation(candidate.validation), log: false };
  }
  const status = clientStatusCode(candidate);
  if (status !== null) {
    const message = status === 429 ? 'Too many requests.' : typeof candidate.message === 'string' ? candidate.message : 'Bad request.';
    return { status, code: CODE_BY_STATUS[status] ?? 'bad_request', message, log: false };
  }
  return INTERNAL;
}
