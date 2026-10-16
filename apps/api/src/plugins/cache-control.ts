import type { FastifyInstance } from 'fastify';

const PRIVATE_NO_STORE = 'private, no-store';

/**
 * The `Cache-Control` a response gets when its route chose none, from the URL alone: `private, no-store` for the API
 * and auth paths (personal data), except the public pages, which decide their own caching (the careers pages are
 * meant to be cached). Null leaves the response as it is. Classifies paths only; it authorizes nothing.
 */
export function defaultCacheControl(url: string): string | null {
  const path = url.split('?')[0] ?? '';
  if (path.startsWith('/api/v1/public/')) return null;
  return path.startsWith('/api/v1/') || path.startsWith('/api/auth/') ? PRIVATE_NO_STORE : null;
}

/**
 * A response with personal data must never sit in a shared cache or a browser's disk cache by accident: every API
 * route that did not choose a `Cache-Control` of its own gets `private, no-store`. A response hook that only sets a
 * header: the routes it applies to are rate limited by the global `@fastify/rate-limit` (see `registerSecurity`).
 */
export function registerNoStoreByDefault(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply, payload) => {
    const value = reply.hasHeader('cache-control') ? null : defaultCacheControl(request.url);
    if (value !== null) reply.header('cache-control', value);
    return payload;
  });
}
