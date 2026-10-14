import { StorageUnavailableError } from './errors.js';
import type { FileStorage } from './intake-ports.js';

/** Errors that mean "this key" and not "the storage": they keep their own handling. */
const isKeyProblem = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'FileNotFoundError' || error.name === 'InvalidStorageKeyError');

const guarded = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    throw isKeyProblem(error) ? error : new StorageUnavailableError(error);
  }
};

/** An error thrown by the `source` itself (a refused upload, a failed ZIP) is not a storage outage: it keeps its own handling. */
const guardedPut = async (files: FileStorage, key: string, source: AsyncIterable<Uint8Array>, mediaType: string): Promise<number> => {
  let fromSource: { readonly error: unknown } | null = null;
  const watched = (async function* () {
    try {
      yield* source;
    } catch (error) {
      fromSource = { error };
      throw error;
    }
  })();
  try {
    return await files.putStream(key, watched, mediaType);
  } catch (error) {
    if (fromSource) throw (fromSource as { error: unknown }).error;
    throw isKeyProblem(error) ? error : new StorageUnavailableError(error);
  }
};

/** Wraps a storage so every infrastructure failure surfaces as `StorageUnavailableError` (HTTP 503), never a generic 500. */
export const withStorageErrors = (files: FileStorage): FileStorage => ({
  put: (key, bytes, mediaType) => guarded(() => files.put(key, bytes, mediaType)),
  putStream: (key, source, mediaType) => guardedPut(files, key, source, mediaType),
  get: (key) => guarded(() => files.get(key)),
  getStream: (key) => guarded(() => files.getStream(key)),
  delete: (key) => guarded(() => files.delete(key)),
});
