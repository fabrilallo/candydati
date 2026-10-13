import { openCv } from '@tt/core';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { contentDisposition, wantsInline } from '../http/content-disposition.js';
import { paramOf, queryOf } from './request.js';

/**
 * The original CV. Never cached, never sniffed. Only a PDF may be shown inline, and then inside a CSP sandbox so a
 * crafted file cannot run script in the api origin.
 */
export function registerApplicationCvRoute(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v1/applications/:id/cv', async (request, reply) => {
    const file = await openCv(ctx.candidateDeps, await ctx.resolveActor(request), { applicationId: paramOf(request, 'id') });
    const inline = wantsInline(queryOf(request).disposition, file.mediaType);
    reply
      .header('content-type', file.mediaType)
      .header('content-length', file.bytes.byteLength)
      .header('content-disposition', contentDisposition(inline ? 'inline' : 'attachment', file.fileName))
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff');
    if (inline) reply.header('content-security-policy', 'sandbox');
    return reply.send(Buffer.from(file.bytes));
  });
}
