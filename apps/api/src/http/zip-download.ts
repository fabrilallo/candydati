import { Readable } from 'node:stream';
import type { FastifyReply } from 'fastify';
import { contentDisposition } from './content-disposition.js';

/** A generated archive: always an attachment, never cached by a browser or a shared cache, never sniffed. */
export function sendZip(reply: FastifyReply, bytes: Uint8Array, fileName: string): FastifyReply {
  return reply
    .header('content-type', 'application/zip')
    .header('content-length', bytes.byteLength)
    .header('content-disposition', contentDisposition('attachment', fileName))
    .header('cache-control', 'private, no-store')
    .header('x-content-type-options', 'nosniff')
    .send(Buffer.from(bytes));
}

/** Same headers for an archive read from storage: the body is piped, never held in memory. */
export function sendZipStream(reply: FastifyReply, stream: AsyncIterable<Uint8Array>, sizeBytes: number | null, fileName: string): FastifyReply {
  const response = reply
    .header('content-type', 'application/zip')
    .header('content-disposition', contentDisposition('attachment', fileName))
    .header('cache-control', 'private, no-store')
    .header('x-content-type-options', 'nosniff');
  if (sizeBytes !== null) response.header('content-length', sizeBytes);
  return response.send(Readable.from(stream));
}
