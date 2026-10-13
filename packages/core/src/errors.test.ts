import { describe, expect, it } from 'vitest';
import { AuditWriteError, ConflictError, CoreError, ForbiddenError, NotFoundError, ValidationError } from './errors.js';

describe('errors', () => {
  it.each([
    [new ForbiddenError(), 'forbidden'],
    [new NotFoundError(), 'not_found'],
    [new ValidationError([]), 'validation_failed'],
    [new ConflictError(), 'conflict'],
    [new AuditWriteError(new Error('db down')), 'audit_failed'],
  ] as const)('exposes a stable code (%s)', (error, code) => {
    expect(error).toBeInstanceOf(CoreError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
  });

  it('keeps messages safe: no internals from the cause', () => {
    const error = new AuditWriteError(new Error('connection to 10.0.0.1 refused'));
    expect(error.message).not.toContain('10.0.0.1');
    expect((error.cause as Error).message).toContain('10.0.0.1');
  });

  it('accepts custom messages and carries validation issues', () => {
    expect(new NotFoundError('Candidate not found').message).toBe('Candidate not found');
    const error = new ValidationError([{ path: 'page', message: 'Too small' }]);
    expect(error.issues).toEqual([{ path: 'page', message: 'Too small' }]);
  });
});
