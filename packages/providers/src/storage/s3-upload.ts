import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  type CompletedPart,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

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

/** One streaming upload: buffers up to one part, switches to a multipart upload past it, aborts it on failure. */
class StreamUpload {
  private chunks: Uint8Array[] = [];
  private pending = 0;
  private total = 0;
  private uploadId: string | undefined;
  private readonly parts: CompletedPart[] = [];

  constructor(
    private readonly client: S3Client,
    private readonly Bucket: string,
    private readonly Key: string,
    private readonly mediaType: string,
  ) {}

  async run(source: AsyncIterable<Uint8Array>): Promise<number> {
    try {
      for await (const chunk of source) {
        this.chunks.push(chunk);
        this.pending += chunk.byteLength;
        this.total += chunk.byteLength;
        if (this.pending >= MULTIPART_PART_BYTES) await this.sendPart();
      }
      await this.finish();
      return this.total;
    } catch (error) {
      if (this.uploadId !== undefined) {
        await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.Bucket, Key: this.Key, UploadId: this.uploadId })).catch(() => undefined);
      }
      throw error;
    }
  }

  private async finish(): Promise<void> {
    const { client, Bucket, Key } = this;
    if (this.uploadId === undefined) {
      await client.send(new PutObjectCommand({ Bucket, Key, Body: concat(this.chunks, this.pending), ContentType: this.mediaType }));
      return;
    }
    if (this.pending > 0) await this.sendPart();
    await client.send(new CompleteMultipartUploadCommand({ Bucket, Key, UploadId: this.uploadId, MultipartUpload: { Parts: this.parts } }));
  }

  private async sendPart(): Promise<void> {
    const { client, Bucket, Key } = this;
    if (this.uploadId === undefined) {
      const started = await client.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType: this.mediaType }));
      this.uploadId = started.UploadId;
      if (!this.uploadId) throw new Error('S3 returned no multipart upload id.');
    }
    const PartNumber = this.parts.length + 1;
    const done = await client.send(new UploadPartCommand({ Bucket, Key, UploadId: this.uploadId, PartNumber, Body: concat(this.chunks, this.pending) }));
    this.parts.push({ ETag: done.ETag, PartNumber });
    this.chunks = [];
    this.pending = 0;
  }
}

export const uploadStream = (client: S3Client, Bucket: string, Key: string, source: AsyncIterable<Uint8Array>, mediaType: string): Promise<number> =>
  new StreamUpload(client, Bucket, Key, mediaType).run(source);
