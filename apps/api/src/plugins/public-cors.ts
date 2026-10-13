import type { FastifyInstance } from 'fastify';

/**
 * Open read access for the public API: `Access-Control-Allow-Origin: *` on GET (and HEAD) replies of the routes
 * registered inside the given scope, and never credentials. Cookies are never sent to a `*` origin by browsers, so a
 * foreign page can read what anyone can read, and nothing more. The authenticated routes keep the strict list of
 * trusted origins with credentials; the scope is what keeps the two apart, so register ONLY public reads in it.
 * Runs after `@fastify/cors`, so it replaces what the trusted-origin policy wrote for this response.
 */
export function openPublicReads(scope: FastifyInstance): void {
  scope.addHook('onSend', async (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return;
    reply.header('access-control-allow-origin', '*');
    reply.removeHeader('access-control-allow-credentials');
  });
}
