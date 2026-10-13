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
