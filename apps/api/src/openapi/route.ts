import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { publicRouteConfig } from '../routes/limits.js';
import { PUBLIC_CACHE_CONTROL } from '../routes/public-jobs.js';
import { buildOpenApiDocument } from './document.js';

export const OPENAPI_PATH = '/api/v1/openapi.json';
export const API_VERSION = '1';

/** The spec of the public API: public, built once, cacheable by the CDN. A plain OpenAPI document, not the envelope. */
export function registerOpenApiRoute(app: FastifyInstance, ctx: AppContext): void {
  const document = buildOpenApiDocument({ title: `${ctx.env.platform.name} API`, version: API_VERSION });
  app.get(OPENAPI_PATH, { config: publicRouteConfig(ctx) }, async (_request, reply) =>
    reply.header('cache-control', PUBLIC_CACHE_CONTROL).send(document),
  );
}
