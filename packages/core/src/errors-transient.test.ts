import { describe, expect, it } from 'vitest';
import { ConflictError, isTransientError } from './errors.js';

describe('isTransientError', () => {
  it('recognises deadlocks, serialization failures and lost connections, also wrapped by the driver', () => {
    expect(isTransientError(Object.assign(new Error('deadlock'), { code: '40P01' }))).toBe(true);
    expect(isTransientError(new Error('query failed', { cause: Object.assign(new Error('x'), { code: '40001' }) }))).toBe(true);
    expect(isTransientError(Object.assign(new Error('gone'), { code: '08006' }))).toBe(true);
    expect(isTransientError(Object.assign(new Error('busy'), { code: '53300' }))).toBe(true);
    expect(isTransientError(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))).toBe(true);
  });

  it('treats constraint violations, domain errors and plain errors as permanent', () => {
    expect(isTransientError(Object.assign(new Error('dup'), { code: '23505' }))).toBe(false);
    expect(isTransientError(new ConflictError('job_closed'))).toBe(false);
    expect(isTransientError(new Error('boom'))).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});
