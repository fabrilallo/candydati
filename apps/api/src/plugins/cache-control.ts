import type { FastifyInstance } from 'fastify';

const PRIVATE_NO_STORE = 'private, no-store';

/** Public pages decide their own caching (the careers pages are meant to be cached). Everything else is personal. */
const isPublicPath = (path: string): boolean => path.startsWith('/api/v1/public/');
const isAuthenticatedApi = (path: string): boolean => path.startsWith('/api/v1/') || path.startsWith('/api/auth/');

/**
 * A response with personal data must never sit in a shared cache or a browser's disk cache by accident: every
 * authenticated route that did not choose a `Cache-Control` of its own gets `private, no-store`.
 */
export function registerNoStoreByDefault(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url.split('?')[0] ?? '';
    if (isAuthenticatedApi(path) && !isPublicPath(path) && !reply.hasHeader('cache-control')) {
      reply.header('cache-control', PRIVATE_NO_STORE);
    }
    return payload;
  });
}
