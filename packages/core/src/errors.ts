export const ERROR_CODES = ['forbidden', 'not_found', 'validation_failed', 'conflict', 'rate_limited', 'audit_failed', 'storage_unavailable', 'stale_revision'] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Base of everything a use case throws on purpose. Transport-agnostic: adapters map `code` to HTTP status,
 * agent tool errors or MCP errors. `message` is safe to show to a user; internals live in `cause`.
 */
export abstract class CoreError extends Error {
  abstract readonly code: ErrorCode;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ForbiddenError extends CoreError {
  readonly code = 'forbidden';

  constructor(message = 'You are not allowed to do this.') {
    super(message);
  }
}

export class NotFoundError extends CoreError {
  readonly code = 'not_found';

  constructor(message = 'Not found.') {
    super(message);
  }
}

export class ConflictError extends CoreError {
  readonly code = 'conflict';

  constructor(message = 'The request conflicts with the current state.') {
    super(message);
  }
}

/**
 * The caller wrote over a version it never saw (optimistic lock): someone else saved meanwhile. Reload, then retry.
 * `message` is safe to show.
 */
export class StaleRevisionError extends CoreError {
  readonly code = 'stale_revision';

  constructor(message = 'Someone else changed this in the meantime. Reload to see their version.') {
    super(message);
  }
}

/** A daily cap was reached. `message` is safe to show to the person who hit it. */
export class RateLimitedError extends CoreError {
  readonly code = 'rate_limited';

  constructor(message = 'Too many requests. Please try again later.') {
    super(message);
  }
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class ValidationError extends CoreError {
  readonly code = 'validation_failed';

  constructor(
    readonly issues: readonly ValidationIssue[],
    message = 'The input is not valid.',
  ) {
    super(message);
  }
}

/** The action ran but its audit record could not be written: it must not look like a clean success. */
export class AuditWriteError extends CoreError {
  readonly code = 'audit_failed';

  constructor(cause: unknown) {
    super('The action could not be recorded in the audit log.', { cause });
  }
}

/** The file storage failed (down, timeout, credentials). Safe message; the original error stays in `cause` for the log. */
export class StorageUnavailableError extends CoreError {
  readonly code = 'storage_unavailable';

  constructor(cause: unknown) {
    super('File storage is temporarily unavailable. Please try again shortly.', { cause });
  }
}

export const isCoreError = (value: unknown): value is CoreError => value instanceof CoreError;

/**
 * SQLSTATE classes and codes that mean "try again": serialization failure (40001), deadlock (40P01), lock not available
 * (55P03), insufficient resources (class 53), connection exceptions (class 08), operator intervention (class 57). The
 * code is read from the error or its `cause` (Drizzle wraps the driver's error).
 */
const TRANSIENT_CODES = new Set(['40001', '40P01', '55P03']);
const TRANSIENT_CLASSES = new Set(['08', '53', '57']);
/** The connection itself dropped or timed out (Node's codes). */
const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE']);

const isTransientCode = (code: string): boolean =>
  NETWORK_CODES.has(code) || (/^[0-9A-Z]{5}$/.test(code) && (TRANSIENT_CODES.has(code) || TRANSIENT_CLASSES.has(code.slice(0, 2))));

/** True for a storage error worth retrying as it is (see the codes above); false for everything else. */
export const isTransientError = (error: unknown, depth = 0): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && isTransientCode(code)) return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  return depth < 3 && cause !== undefined && cause !== error && isTransientError(cause, depth + 1);
};
