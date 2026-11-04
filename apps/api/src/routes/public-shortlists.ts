import { answerShortlistCandidate, getClientShortlist, openShortlistCv } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppContext } from '../app-context.js';
import { contentDisposition } from '../http/content-disposition.js';
import { feedbackRouteConfig } from './limits.js';
import { bodyOf, paramOf } from './request.js';

/** Never stored by a browser or a proxy, never indexed, never framed: the page shows candidate data behind a secret. */
const privateReply = (reply: FastifyReply): FastifyReply =>
  reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex, nofollow').header('referrer-policy', 'no-referrer');

/**
 * A client's shortlist without login (PRODUCT.md §3.5): the personal token in the path is the only credential, no session
 * and no cookie is read. Same per-client rate limit as the feedback links. Unknown, expired, revoked or erased links are
 * a 404; a candidate already answered is a 409.
 */
export function registerPublicShortlistRoutes(app: FastifyInstance, ctx: AppContext): void {
  const config = feedbackRouteConfig(ctx);
  const deps = ctx.publicShortlistDeps;

  app.get('/api/v1/public/shortlists/:token', { config }, async (request, reply) =>
    privateReply(reply).send(ok(await getClientShortlist(deps, { token: paramOf(request, 'token') }))),
  );

  app.post('/api/v1/public/shortlists/:token/answers', { config }, async (request, reply) =>
    privateReply(reply).send(ok(await answerShortlistCandidate(deps, { ...bodyOf(request), token: paramOf(request, 'token') }))),
  );

  // A PDF is shown inline inside a CSP sandbox; any other type is a download, never rendered.
  app.get('/api/v1/public/shortlists/:token/candidates/:itemId/cv', { config }, async (request, reply) => {
    const file = await openShortlistCv(deps, { token: paramOf(request, 'token'), itemId: paramOf(request, 'itemId') });
    privateReply(reply)
      .header('content-type', file.inlineable ? file.mediaType : 'application/octet-stream')
      .header('content-length', file.bytes.byteLength)
      .header('content-disposition', contentDisposition(file.inlineable ? 'inline' : 'attachment', file.fileName))
      .header('x-content-type-options', 'nosniff');
    if (file.inlineable) reply.header('content-security-policy', 'sandbox');
    return reply.send(Buffer.from(file.bytes));
  });
}
