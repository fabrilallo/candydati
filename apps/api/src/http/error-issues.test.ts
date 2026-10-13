import { ConflictError, ValidationError } from '@tt/core';
import { describe, expect, it } from 'vitest';
import { issuesOf } from './error-issues.js';

describe('issuesOf', () => {
  it('returns path and message of a validation error', () => {
    expect(issuesOf(new ValidationError([{ path: 'salary.max', message: 'Required' }]))).toEqual([{ path: 'salary.max', message: 'Required' }]);
  });

  it('is empty for other errors and non-errors', () => {
    expect(issuesOf(new ConflictError())).toEqual([]);
    expect(issuesOf('x')).toEqual([]);
  });
});
