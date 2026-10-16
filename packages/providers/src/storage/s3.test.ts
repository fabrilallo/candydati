import { DeleteBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { randomBytes, randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadS3Config, type S3Config } from './config.js';
import { createS3FileStorage, MULTIPART_PART_BYTES, type S3FileStorage } from './s3.js';
import { FileNotFoundError, InvalidStorageKeyError } from './types.js';

const config: S3Config = loadS3Config({
  S3_ENDPOINT: process.env['S3_ENDPOINT'] ?? 'http://localhost:9000',
  S3_BUCKET: process.env['S3_BUCKET'] ?? 'candydati-test',
  S3_ACCESS_KEY: process.env['S3_ACCESS_KEY'] ?? 'candydati-minio',
  S3_SECRET_KEY: process.env['S3_SECRET_KEY'] ?? 'candydati-minio-secret',
  S3_FORCE_PATH_STYLE: 'true',
});

function reachable(endpoint: string): Promise<boolean> {
  const url = new URL(endpoint);
  return new Promise((resolve) => {
    const socket = createConnection({ host: url.hostname, port: Number(url.port || 80), timeout: 1000 });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
  });
}

/** The bucket must be empty: the test deletes its only object first. */
async function removeBucket(Bucket: string): Promise<void> {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  try {
    await client.send(new DeleteBucketCommand({ Bucket }));
  } finally {
    client.destroy();
  }
}

const up = await reachable(config.endpoint);
if (!up) {
  process.stderr.write(`[providers] MinIO unreachable at ${config.endpoint}: S3 integration tests skipped (run pnpm infra:up).\n`);
}

describe.skipIf(!up)('createS3FileStorage (MinIO)', () => {
  let storage: S3FileStorage;
  const prefix = `test-${randomUUID()}`;
  const created: string[] = [];

  beforeAll(async () => {
    storage = createS3FileStorage(config);
    await storage.ensureBucket();
    await storage.ensureBucket();
  });

  afterAll(async () => {
    await Promise.all(created.map((key) => storage.delete(key)));
  });

  it('round-trips bytes and deletes', async () => {
    const key = `${prefix}/file.bin`;
    created.push(key);
    await storage.put(key, new Uint8Array([0, 1, 2, 255]), 'application/octet-stream');
    expect([...(await storage.get(key))]).toEqual([0, 1, 2, 255]);
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrow(FileNotFoundError);
  });

  it('uploads a stream in several parts and reads it back as a stream', async () => {
    const key = `${prefix}/big.bin`;
    created.push(key);
    const part = randomBytes(MULTIPART_PART_BYTES);
    const tail = randomBytes(1234);
    const source = (async function* () {
      yield part.subarray(0, 1000);
      yield part.subarray(1000);
      yield tail;
    })();
    expect(await storage.putStream(key, source, 'application/octet-stream')).toBe(MULTIPART_PART_BYTES + 1234);
    const { stream, sizeBytes } = await storage.getStream(key);
    expect(sizeBytes).toBe(MULTIPART_PART_BYTES + 1234);
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).equals(Buffer.concat([part, tail]))).toBe(true);
  });

  it('stores a small stream with a single put, and nothing when the source fails', async () => {
    const small = `${prefix}/small.bin`;
    created.push(small);
    expect(await storage.putStream(small, (async function* () { yield new Uint8Array([7, 8]); })(), 'application/octet-stream')).toBe(2);
    expect([...(await storage.get(small))]).toEqual([7, 8]);
    const broken = `${prefix}/broken.bin`;
    const failing = (async function* () {
      yield randomBytes(MULTIPART_PART_BYTES);
      throw new Error('source failed');
    })();
    await expect(storage.putStream(broken, failing, 'application/octet-stream')).rejects.toThrow('source failed');
    await expect(storage.get(broken)).rejects.toThrow(FileNotFoundError);
    await expect(storage.getStream(`${prefix}/missing`)).rejects.toThrow(FileNotFoundError);
  });

  it('reads an inclusive byte range as a stream', async () => {
    const key = `${prefix}/range.bin`;
    created.push(key);
    await storage.put(key, new Uint8Array([10, 11, 12, 13, 14, 15]), 'application/octet-stream');
    const { stream, sizeBytes } = await storage.getRange!(key, 1, 3);
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect([...Buffer.concat(chunks)]).toEqual([11, 12, 13]);
    expect(sizeBytes).toBe(3);
    await expect(storage.getRange!(`${prefix}/missing`, 0, 1)).rejects.toThrow(FileNotFoundError);
    await expect(storage.getRange!(key, 3, 1)).rejects.toThrow(RangeError);
  });

  it('rejects invalid keys before any request', async () => {
    await expect(storage.put('../x', new Uint8Array(), 'x/y')).rejects.toThrow(InvalidStorageKeyError);
    await expect(storage.get('a b')).rejects.toThrow(InvalidStorageKeyError);
  });

  it('creates a missing bucket', async () => {
    const bucket = `candydati-fresh-${randomUUID().slice(0, 8)}`;
    const fresh = createS3FileStorage({ ...config, bucket });
    try {
      await fresh.ensureBucket();
      await fresh.put('x', new Uint8Array([1]), 'application/octet-stream');
      expect([...(await fresh.get('x'))]).toEqual([1]);
    } finally {
      await fresh.delete('x');
      await removeBucket(bucket);
    }
  });
});
