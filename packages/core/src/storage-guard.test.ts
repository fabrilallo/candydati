import { describe, expect, it } from 'vitest';
import { StorageUnavailableError } from './errors.js';
import type { FileStorage } from './intake-ports.js';
import { withStorageErrors } from './storage-guard.js';

const failing = (error: Error): FileStorage => ({
  put: () => Promise.reject(error),
  putStream: () => Promise.reject(error),
  get: () => Promise.reject(error),
  getStream: () => Promise.reject(error),
  delete: () => Promise.reject(error),
});

const bytes = async function* () {
  yield new Uint8Array([1]);
};

describe('withStorageErrors', () => {
  it('turns infrastructure failures into StorageUnavailableError, keeping the cause', async () => {
    const cause = new Error('ECONNREFUSED');
    const files = withStorageErrors(failing(cause));
    for (const call of [files.put('k', new Uint8Array(), 't'), files.putStream('k', bytes(), 't'), files.get('k'), files.getStream('k'), files.delete('k')]) {
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
    const files = withStorageErrors({ ...failing(new Error('unused')), get: async () => new Uint8Array([1]) });
    expect(await files.get('k')).toEqual(new Uint8Array([1]));
  });

  it('does not turn an error of the streamed source into a storage outage', async () => {
    const refused = Object.assign(new Error('too large'), { statusCode: 413 });
    const consuming: FileStorage = {
      ...failing(new Error('unused')),
      putStream: async (_key, source) => {
        for await (const chunk of source) void chunk;
        return 0;
      },
    };
    const source = (async function* () {
      yield new Uint8Array([1]);
      throw refused;
    })();
    await expect(withStorageErrors(consuming).putStream('k', source, 't')).rejects.toBe(refused);
  });
});
