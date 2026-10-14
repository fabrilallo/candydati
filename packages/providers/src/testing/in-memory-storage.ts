import { assertStorageKey } from '../storage/keys.js';
import { FileNotFoundError, type FileStorage } from '../storage/types.js';

/** Map-backed storage for tests. Copies bytes on the way in and out so callers cannot mutate stored data. */
export function createInMemoryFileStorage(): FileStorage & { readonly keys: () => readonly string[] } {
  const files = new Map<string, Uint8Array>();
  return {
    async put(key, bytes) {
      files.set(assertStorageKey(key), new Uint8Array(bytes));
    },
    async putStream(key, source) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of source) chunks.push(chunk);
      const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      files.set(assertStorageKey(key), bytes);
      return size;
    },
    async getStream(key) {
      const found = files.get(assertStorageKey(key));
      if (!found) throw new FileNotFoundError(key);
      const copy = new Uint8Array(found);
      const half = Math.ceil(copy.byteLength / 2);
      return {
        stream: (async function* () {
          yield copy.subarray(0, half);
          yield copy.subarray(half);
        })(),
        sizeBytes: copy.byteLength,
      };
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
