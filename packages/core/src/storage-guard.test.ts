import { describe, expect, it } from 'vitest';
import { StorageUnavailableError } from './errors.js';
import type { FileStorage } from './intake-ports.js';
import { withStorageErrors } from './storage-guard.js';

const failing = (error: Error): FileStorage => ({
  put: () => Promise.reject(error),
  get: () => Promise.reject(error),
  delete: () => Promise.reject(error),
});

describe('withStorageErrors', () => {
  it('turns infrastructure failures into StorageUnavailableError, keeping the cause', async () => {
    const cause = new Error('ECONNREFUSED');
    const files = withStorageErrors(failing(cause));
    for (const call of [files.put('k', new Uint8Array(), 't'), files.get('k'), files.delete('k')]) {
      const error = await call.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StorageUnavailableError);
      expect((error as StorageUnavailableError).message).not.toContain('ECONNREFUSED');
      expect((error as StorageUnavailableError).cause).toBe(cause);
    }
  });

  it('lets key problems through untouched', async () => {
    const missing = Object.assign(new Error('nope'), { name: 'FileNotFoundError' });
    await expect(withStorageErrors(failing(missing)).get('k')).rejects.toBe(missing);
  });

  it('passes successes through', async () => {
    const files = withStorageErrors({ put: async () => undefined, get: async () => new Uint8Array([1]), delete: async () => undefined });
    expect(await files.get('k')).toEqual(new Uint8Array([1]));
  });
});
