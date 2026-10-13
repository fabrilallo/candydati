export const ERROR_CODES = ['forbidden', 'not_found', 'validation_failed', 'conflict', 'rate_limited', 'audit_failed'] as const;
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

export const isCoreError = (value: unknown): value is CoreError => value instanceof CoreError;
