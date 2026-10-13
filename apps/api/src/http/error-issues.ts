import { isCoreError, ValidationError } from '@tt/core';

export interface ErrorIssue {
  readonly path: string;
  readonly message: string;
}

/** Structured validation issues of a use case, for clients that map them to fields. Empty for every other error. */
export function issuesOf(error: unknown): readonly ErrorIssue[] {
  if (!isCoreError(error) || !(error instanceof ValidationError)) return [];
  return error.issues.map(({ path, message }) => ({ path, message }));
}
