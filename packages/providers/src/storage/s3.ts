import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  type CompletedPart,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { assertStorageKey } from './keys.js';
import type { S3Config } from './config.js';
import { FileNotFoundError, type FileStorage } from './types.js';

export interface S3FileStorage extends FileStorage {
  /** Creates the bucket when missing. Call once at startup, not per request. */
  ensureBucket(): Promise<void>;
}

/** S3 needs at least 5 MiB per part but the last; this is also the memory bound of a streaming upload. */
export const MULTIPART_PART_BYTES = 8 * 1024 * 1024;

const concat = (chunks: readonly Uint8Array[], size: number): Uint8Array => {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

const errorName = (error: unknown): string => (error instanceof Error ? error.name : '');

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
    async putStream(key, source, mediaType) {
      const Key = assertStorageKey(key);
      let chunks: Uint8Array[] = [];
      let pending = 0;
      let total = 0;
      let uploadId: string | undefined;
      const parts: CompletedPart[] = [];
      const sendPart = async (): Promise<void> => {
        if (uploadId === undefined) {
          const started = await client.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType: mediaType }));
          uploadId = started.UploadId;
          if (!uploadId) throw new Error('S3 returned no multipart upload id.');
        }
        const PartNumber = parts.length + 1;
        const done = await client.send(new UploadPartCommand({ Bucket, Key, UploadId: uploadId, PartNumber, Body: concat(chunks, pending) }));
        parts.push({ ETag: done.ETag, PartNumber });
        chunks = [];
        pending = 0;
      };
      try {
        for await (const chunk of source) {
          chunks.push(chunk);
          pending += chunk.byteLength;
          total += chunk.byteLength;
          if (pending >= MULTIPART_PART_BYTES) await sendPart();
        }
        if (uploadId === undefined) {
          await client.send(new PutObjectCommand({ Bucket, Key, Body: concat(chunks, pending), ContentType: mediaType }));
          return total;
        }
        if (pending > 0) await sendPart();
        await client.send(new CompleteMultipartUploadCommand({ Bucket, Key, UploadId: uploadId, MultipartUpload: { Parts: parts } }));
        return total;
      } catch (error) {
        if (uploadId !== undefined) await client.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId: uploadId })).catch(() => undefined);
        throw error;
      }
    },
    async getStream(key) {
      try {
        const output = await client.send(new GetObjectCommand({ Bucket, Key: assertStorageKey(key) }));
        if (!output.Body) throw new FileNotFoundError(key);
        return { stream: output.Body as AsyncIterable<Uint8Array>, sizeBytes: output.ContentLength ?? null };
      } catch (error) {
        if (['NoSuchKey', 'NotFound'].includes(errorName(error))) throw new FileNotFoundError(key);
        throw error;
      }
    },
    async get(key) {
      try {
        const output = await client.send(new GetObjectCommand({ Bucket, Key: assertStorageKey(key) }));
        if (!output.Body) throw new FileNotFoundError(key);
        return await output.Body.transformToByteArray();
      } catch (error) {
        if (['NoSuchKey', 'NotFound'].includes(errorName(error))) throw new FileNotFoundError(key);
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: assertStorageKey(key) }));
    },
  };
}
