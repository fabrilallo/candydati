/** An object read as a stream. `sizeBytes` is null when the backend does not say. */
export interface StoredStream {
  readonly stream: AsyncIterable<Uint8Array>;
  readonly sizeBytes: number | null;
}

export interface FileStorage {
  put(key: string, bytes: Uint8Array, mediaType: string): Promise<void>;
  /**
   * Stores what `source` yields without holding it all in memory (multipart upload on S3); returns the bytes written.
   * When `source` throws, nothing is stored.
   */
  putStream(key: string, source: AsyncIterable<Uint8Array>, mediaType: string): Promise<number>;
  get(key: string): Promise<Uint8Array>;
  /** @throws FileNotFoundError when the key does not exist. */
  getStream(key: string): Promise<StoredStream>;
  delete(key: string): Promise<void>;
  /** Bytes `start` to `end` (inclusive), for video seeking. @throws FileNotFoundError when the key does not exist. */
  getRange?(key: string, start: number, end: number): Promise<StoredStream>;
}

export class FileNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`File not found: ${key}`);
    this.name = 'FileNotFoundError';
  }
}

export class InvalidStorageKeyError extends Error {
  constructor(readonly key: string) {
    super('Invalid storage key.');
    this.name = 'InvalidStorageKeyError';
  }
}
