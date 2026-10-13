import { describe, expect, it, vi } from 'vitest';
import { createDb } from './index.js';
import { testDatabaseUrl } from './testing/test-database.js';

describe('createDb', () => {
  it('throws on an empty database url', () => {
    expect(() => createDb('')).toThrow(/DATABASE_URL/);
  });

  it('returns a usable handle that can be closed', async () => {
    const handle = createDb(testDatabaseUrl());
    const { rows } = await handle.pool.query('select 1 as one');
    expect(rows[0]).toEqual({ one: 1 });
    await expect(handle.close()).resolves.toBeUndefined();
  });

  it('hands idle client errors to the given handler instead of crashing', async () => {
    const onIdleError = vi.fn();
    const handle = createDb(testDatabaseUrl(), 1, onIdleError);
    const error = new Error('boom');
    handle.pool.emit('error', error);
    expect(onIdleError).toHaveBeenCalledWith(error);
    await handle.close();
  });

  it('writes idle client errors to stderr when no handler is given', async () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const handle = createDb(testDatabaseUrl(), 1);
    handle.pool.emit('error', new Error('boom'));
    expect(spy).toHaveBeenCalledWith('[db] idle client error: boom\n');
    spy.mockRestore();
    await handle.close();
  });
});
