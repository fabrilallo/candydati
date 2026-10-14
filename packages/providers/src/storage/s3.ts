import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, type GetObjectCommandOutput, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { assertStorageKey } from './keys.js';
import type { S3Config } from './config.js';
import { uploadStream } from './s3-upload.js';
import { FileNotFoundError, type FileStorage } from './types.js';

export { MULTIPART_PART_BYTES } from './s3-upload.js';

export interface S3FileStorage extends FileStorage {
  /** Creates the bucket when missing. Call once at startup, not per request. */
  ensureBucket(): Promise<void>;
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : '');

/** Reads an object, turning "missing" into `FileNotFoundError`. */
async function readObject<T>(client: S3Client, Bucket: string, key: string, read: (output: GetObjectCommandOutput) => Promise<T>): Promise<T> {
  try {
    const output = await client.send(new GetObjectCommand({ Bucket, Key: assertStorageKey(key) }));
    if (!output.Body) throw new FileNotFoundError(key);
    return await read(output);
  } catch (error) {
    if (['NoSuchKey', 'NotFound'].includes(errorName(error))) throw new FileNotFoundError(key);
    throw error;
  }
}

export function createS3FileStorage(config: S3Config): S3FileStorage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const Bucket = config.bucket;
  return {
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch (error) {
        if (!['NotFound', 'NoSuchBucket'].includes(errorName(error))) throw error;
        await client.send(new CreateBucketCommand({ Bucket }));
      }
    },
    async put(key, bytes, mediaType) {
      await client.send(new PutObjectCommand({ Bucket, Key: assertStorageKey(key), Body: bytes, ContentType: mediaType }));
    },
    putStream: (key, source, mediaType) => uploadStream(client, Bucket, assertStorageKey(key), source, mediaType),
    getStream: (key) =>
      readObject(client, Bucket, key, async (output) => ({ stream: output.Body as AsyncIterable<Uint8Array>, sizeBytes: output.ContentLength ?? null })),
    get: (key) => readObject(client, Bucket, key, (output) => output.Body!.transformToByteArray()),
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: assertStorageKey(key) }));
    },
  };
}
