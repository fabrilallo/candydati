import { getFeedbackRequest, openFeedbackCv, submitFeedback } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { contentDisposition } from '../http/content-disposition.js';
import { feedbackRouteConfig } from './limits.js';
import { bodyOf, paramOf } from './request.js';

const NO_STORE = 'no-store';

/**
 * Interview feedback without login: the personal token in the path is the only credential, there is no session and no
 * cookie is read. Never cached and never opened to other origins (the web app calls it from its own server). Unknown,
 * expired or erased links are a 404, a link already used a 409.
 */
export function registerPublicFeedbackRoutes(app: FastifyInstance, ctx: AppContext): void {
  const config = feedbackRouteConfig(ctx);
  const deps = ctx.publicFeedbackDeps;

  app.get('/api/v1/public/feedback/:token', { config }, async (request, reply) => {
    const view = await getFeedbackRequest(deps, { token: paramOf(request, 'token') });
    return reply.header('cache-control', NO_STORE).send(ok(view));
  });

  app.post('/api/v1/public/feedback/:token', { config }, async (request, reply) => {
    const result = await submitFeedback(deps, { ...bodyOf(request), token: paramOf(request, 'token') });
    return reply.header('cache-control', NO_STORE).send(ok(result));
  });

  // The CV of the candidate. A PDF is shown inline inside a CSP sandbox; any other type is a download, never rendered.
  app.get('/api/v1/public/feedback/:token/cv', { config }, async (request, reply) => {
    const file = await openFeedbackCv(deps, { token: paramOf(request, 'token') });
    reply
      .header('content-type', file.inlineable ? file.mediaType : 'application/octet-stream')
      .header('content-length', file.bytes.byteLength)
      .header('content-disposition', contentDisposition(file.inlineable ? 'inline' : 'attachment', file.fileName))
      .header('cache-control', NO_STORE)
      .header('x-content-type-options', 'nosniff');
    if (file.inlineable) reply.header('content-security-policy', 'sandbox');
    return reply.send(Buffer.from(file.bytes));
  });
}
