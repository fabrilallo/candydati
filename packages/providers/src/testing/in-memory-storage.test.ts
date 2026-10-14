import { describe, expect, it } from 'vitest';
import { FileNotFoundError, InvalidStorageKeyError } from '../storage/types.js';
import { createInMemoryFileStorage } from './in-memory-storage.js';

describe('createInMemoryFileStorage', () => {
  it('stores, reads copies, deletes', async () => {
    const storage = createInMemoryFileStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.put('a/b.bin', bytes, 'application/octet-stream');
    bytes[0] = 9;
    const read = await storage.get('a/b.bin');
    expect([...read]).toEqual([1, 2, 3]);
    read[1] = 9;
    expect([...(await storage.get('a/b.bin'))]).toEqual([1, 2, 3]);
    expect(storage.keys()).toEqual(['a/b.bin']);
    await storage.delete('a/b.bin');
    await expect(storage.get('a/b.bin')).rejects.toThrow(FileNotFoundError);
  });

  it('validates keys', async () => {
    await expect(createInMemoryFileStorage().put('../x', new Uint8Array(), 'x/y')).rejects.toThrow(InvalidStorageKeyError);
  });
});

describe('streaming', () => {
  it('stores a stream and reads it back in chunks', async () => {
    const storage = createInMemoryFileStorage();
    const written = await storage.putStream('k', (async function* () { yield new Uint8Array([1, 2]); yield new Uint8Array([3]); })(), 'x/y');
    expect(written).toBe(3);
    const { stream, sizeBytes } = await storage.getStream('k');
    const chunks: number[] = [];
    for await (const chunk of stream) chunks.push(...chunk);
    expect(chunks).toEqual([1, 2, 3]);
    expect(sizeBytes).toBe(3);
    await expect(storage.getStream('missing')).rejects.toThrow(FileNotFoundError);
  });
});
