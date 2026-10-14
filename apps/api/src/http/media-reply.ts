import { Readable } from 'node:stream';
import { unsatisfiedRangeSize, type CareersMediaFile } from '@tt/core';
import { fail } from '@tt/domain';
import type { FastifyReply } from 'fastify';

/** Files of the published page: the name carries the content hash and the width, so the bytes behind a URL never change. */
export const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** Files of the library seen in the editor: the browser of the signed-in person may keep them briefly, no shared cache. */
export const PRIVATE_MEDIA_CACHE_CONTROL = 'private, max-age=300';

const baseHeaders = (reply: FastifyReply, mime: string, cacheControl: string): FastifyReply =>
  reply
    .header('content-type', mime)
    .header('cache-control', cacheControl)
    .header('x-content-type-options', 'nosniff')
    // The file is data, never a document: nothing in it may run or load.
    .header('content-security-policy', "default-src 'none'; sandbox")
    .header('cross-origin-resource-policy', 'same-site');

function send(reply: FastifyReply, file: CareersMediaFile, cacheControl: string): FastifyReply {
  const out = baseHeaders(reply, file.mime, cacheControl);
  if (file.mime.startsWith('video/')) out.header('accept-ranges', 'bytes');
  if (file.range) {
    out.status(206).header('content-range', `bytes ${file.range.start}-${file.range.end}/${file.sizeBytes ?? '*'}`);
    out.header('content-length', file.range.end - file.range.start + 1);
  } else if (file.sizeBytes !== null) {
    out.header('content-length', file.sizeBytes);
  }
  return out.send(Readable.from(file.body.stream));
}

/**
 * Streams a careers media file with its headers, 206 for a range, 416 (envelope, `content-range: bytes *\/size`) for a
 * range past the end. Any other error goes to the error handler, without the cache header.
 */
export async function sendMediaFile(reply: FastifyReply, cacheControl: string, open: () => Promise<CareersMediaFile>): Promise<FastifyReply> {
  try {
    return send(reply, await open(), cacheControl);
  } catch (error) {
    const size = unsatisfiedRangeSize(error);
    if (size === null) throw error;
    return reply.status(416).header('content-range', `bytes */${size}`).send(fail('range_not_satisfiable', 'Range not satisfiable.'));
  }
}
