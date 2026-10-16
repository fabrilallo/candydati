import { getPublicCareersMedia, getPublicCareersPage } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { parseByteRange } from '../http/byte-range.js';
import { MEDIA_CACHE_CONTROL, sendMediaFile } from '../http/media-reply.js';
import { openPublicReads } from '../plugins/public-cors.js';
import { publicMediaRouteConfig, publicRouteConfig } from './limits.js';
import { PUBLIC_CACHE_CONTROL } from './public-jobs.js';
import { paramOf } from './request.js';

/**
 * The published careers page and the media files it shows, for visitors: no session, CORS open for GET, cacheable. Only a successful
 * reply gets a cache header: errors never do.
 */
export function registerPublicCareersRoutes(app: FastifyInstance, ctx: AppContext): void {
  void app.register(async (scope) => {
    openPublicReads(scope);
    const deps = ctx.publicCareersDeps;

    scope.get('/api/v1/public/organizations/:orgSlug/careers-page', { config: publicRouteConfig(ctx) }, async (request, reply) => {
      // Awaited first: an error must never leave with the cache header.
      const page = await getPublicCareersPage(deps, { organizationSlug: paramOf(request, 'orgSlug') });
      return reply.header('cache-control', PUBLIC_CACHE_CONTROL).send(ok(page));
    });

    scope.get(
      '/api/v1/public/organizations/:orgSlug/careers-media/:mediaId/:fileName',
      { config: publicMediaRouteConfig(ctx) },
      async (request, reply) => {
        const input = { organizationSlug: paramOf(request, 'orgSlug'), mediaId: paramOf(request, 'mediaId'), fileName: paramOf(request, 'fileName') };
        // Only files of the published page are here: they may live in shared caches for a year.
        return sendMediaFile(reply, MEDIA_CACHE_CONTROL, () => getPublicCareersMedia(deps, { ...input, range: parseByteRange(request.headers.range) }));
      },
    );
  });
}
