import { openAttachment, openCv } from '@candydati/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../app-context.js';
import { contentDisposition, wantsInline } from '../http/content-disposition.js';
import { paramOf, queryOf } from './request.js';

interface StoredFileView {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mediaType: string;
}

/**
 * A stored file of an application. Never cached, never sniffed. Only a PDF may be shown inline, and then inside a CSP
 * sandbox so a crafted file cannot run script in the api origin.
 */
function sendFile(request: FastifyRequest, reply: FastifyReply, file: StoredFileView): FastifyReply {
  const inline = wantsInline(queryOf(request).disposition, file.mediaType);
  reply
    .header('content-type', file.mediaType)
    .header('content-length', file.bytes.byteLength)
    .header('content-disposition', contentDisposition(inline ? 'inline' : 'attachment', file.fileName))
    .header('cache-control', 'private, no-store')
    .header('x-content-type-options', 'nosniff');
  if (inline) reply.header('content-security-policy', 'sandbox');
  return reply.send(Buffer.from(file.bytes));
}

/** The original CV and the attachments of an application: thin adapters over `openCv` and `openAttachment` (audited). */
export function registerApplicationCvRoute(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v1/applications/:id/cv', async (request, reply) => {
    const file = await openCv(ctx.candidateDeps, await ctx.resolveActor(request), { applicationId: paramOf(request, 'id') });
    return sendFile(request, reply, file);
  });
  app.get('/api/v1/applications/:id/attachments/:attachmentId', async (request, reply) => {
    const input = { applicationId: paramOf(request, 'id'), attachmentId: paramOf(request, 'attachmentId') };
    const file = await openAttachment(ctx.candidateDeps, await ctx.resolveActor(request), input);
    return sendFile(request, reply, file);
  });
}
