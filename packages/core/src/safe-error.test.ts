import { describe, expect, it } from 'vitest';
import { ConflictError } from './errors.js';
import { safeErrorCode } from './safe-error.js';

describe('safeErrorCode', () => {
  it('keeps the SQLSTATE, own or from the cause, and never the message', () => {
    expect(safeErrorCode(Object.assign(new Error('duplicate key alice@example.org'), { code: '23505' }))).toBe('pg_23505');
    expect(safeErrorCode(new Error('Failed query: params: alice@example.org', { cause: { code: '22012' } }))).toBe('pg_22012');
  });

  it('falls back to the class name, and to unknown for anything else', () => {
    expect(safeErrorCode(new ConflictError('x'))).toBe('ConflictError');
    expect(safeErrorCode(Object.assign(new Error('x'), { name: 'bad name with spaces' }))).toBe('unknown');
    expect(safeErrorCode('a string')).toBe('unknown');
    expect(safeErrorCode(null)).toBe('unknown');
  });
});
