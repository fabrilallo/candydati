import { assertStorageKey } from '../storage/keys.js';
import { FileNotFoundError, type FileStorage } from '../storage/types.js';

/** Map-backed storage for tests. Copies bytes on the way in and out so callers cannot mutate stored data. */
export function createInMemoryFileStorage(): FileStorage & { readonly keys: () => readonly string[] } {
  const files = new Map<string, Uint8Array>();
  return {
    async put(key, bytes) {
      files.set(assertStorageKey(key), new Uint8Array(bytes));
    },
    async get(key) {
      const found = files.get(assertStorageKey(key));
      if (!found) throw new FileNotFoundError(key);
      return new Uint8Array(found);
    },
    async delete(key) {
      files.delete(assertStorageKey(key));
    },
    keys: () => [...files.keys()],
  };
}
