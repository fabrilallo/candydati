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

/** Wraps a storage so every infrastructure failure surfaces as `StorageUnavailableError` (HTTP 503), never a generic 500. */
export const withStorageErrors = (files: FileStorage): FileStorage => ({
  put: (key, bytes, mediaType) => guarded(() => files.put(key, bytes, mediaType)),
  get: (key) => guarded(() => files.get(key)),
  delete: (key) => guarded(() => files.delete(key)),
});
