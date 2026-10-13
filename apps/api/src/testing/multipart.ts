import { randomUUID } from 'node:crypto';

export interface FieldPart {
  readonly name: string;
  readonly value: string;
  readonly contentType?: string;
}
export interface FilePart {
  readonly name: string;
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly contentType?: string;
}

/** A multipart/form-data body for `app.inject`: no network, no extra dependency. */
export function multipartBody(parts: readonly (FieldPart | FilePart)[]): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----tt-${randomUUID()}`;
  const chunks = parts.flatMap((part) => {
    const head =
      'bytes' in part
        ? `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`
        : `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"\r\n${part.contentType ? `Content-Type: ${part.contentType}\r\n` : ''}\r\n`;
    return [Buffer.from(head), 'bytes' in part ? Buffer.from(part.bytes) : Buffer.from(part.value), Buffer.from('\r\n')];
  });
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
