export interface FileStorage {
  put(key: string, bytes: Uint8Array, mediaType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
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
