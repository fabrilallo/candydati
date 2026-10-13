import { DeleteBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadS3Config, type S3Config } from './config.js';
import { createS3FileStorage, type S3FileStorage } from './s3.js';
import { FileNotFoundError, InvalidStorageKeyError } from './types.js';

const config: S3Config = loadS3Config({
  S3_ENDPOINT: process.env['S3_ENDPOINT'] ?? 'http://localhost:9000',
  S3_BUCKET: process.env['S3_BUCKET'] ?? 'team-tracker-test',
  S3_ACCESS_KEY: process.env['S3_ACCESS_KEY'] ?? 'tt-minio',
  S3_SECRET_KEY: process.env['S3_SECRET_KEY'] ?? 'tt-minio-secret',
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

  it('rejects invalid keys before any request', async () => {
    await expect(storage.put('../x', new Uint8Array(), 'x/y')).rejects.toThrow(InvalidStorageKeyError);
    await expect(storage.get('a b')).rejects.toThrow(InvalidStorageKeyError);
  });

  it('creates a missing bucket', async () => {
    const bucket = `tt-fresh-${randomUUID().slice(0, 8)}`;
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
