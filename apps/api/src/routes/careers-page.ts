import multipart from '@fastify/multipart';
import {
  authorize,
  deleteCareersMedia,
  getCareersMediaFile,
  getCareersPageDraft,
  getOrganizationLogo,
  listCareersMedia,
  publishCareersPage,
  saveCareersPageDraft,
  setOrganizationLogo,
  uploadCareersMedia,
} from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../app-context.js';
import { parseByteRange } from '../http/byte-range.js';
import { PRIVATE_MEDIA_CACHE_CONTROL, sendMediaFile } from '../http/media-reply.js';
import { CAREERS_MEDIA_BODY_LIMIT, CAREERS_MEDIA_MULTIPART_LIMITS, readCareersUpload } from '../http/careers-multipart.js';
import { AD_BODY_LIMIT, careersMediaRouteConfig } from './limits.js';
import { bodyOf, paramOf } from './request.js';

/**
 * The careers page builder: the draft, publishing, the media library and the organization logo. Session only: `careers_page:manage` is never
 * grantable to a key or the agent, and a request carrying a bearer is refused before anything runs. Thin adapters: the use
 * cases hold the rules (permission, audit, limits).
 */
export async function registerCareersPageRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const deps = ctx.careersDeps;
  const actorOf = (request: FastifyRequest) => ctx.resolveSessionActor(request);

  app.get('/api/v1/careers-page', async (request) => ok(await getCareersPageDraft(deps, await actorOf(request), {})));

  app.put('/api/v1/careers-page/draft', { bodyLimit: AD_BODY_LIMIT }, async (request) =>
    ok(await saveCareersPageDraft(deps, await actorOf(request), bodyOf(request))),
  );

  app.post('/api/v1/careers-page/publish', async (request) => ok(await publishCareersPage(deps, await actorOf(request), bodyOf(request))));

  app.get('/api/v1/careers-page/media', async (request) => ok(await listCareersMedia(deps, await actorOf(request), {})));

  // The library's files for the editor (thumbnails, draft preview): never in a shared cache, never public.
  app.get('/api/v1/careers-page/media/:id/files/:fileName', async (request, reply) => {
    const actor = await actorOf(request);
    const input = { mediaId: paramOf(request, 'id'), fileName: paramOf(request, 'fileName'), range: parseByteRange(request.headers.range) };
    return sendMediaFile(reply, PRIVATE_MEDIA_CACHE_CONTROL, () => getCareersMediaFile(deps, actor, input));
  });

  app.delete('/api/v1/careers-page/media/:id', async (request) =>
    ok(await deleteCareersMedia(deps, await actorOf(request), { mediaId: paramOf(request, 'id') })),
  );

  // The logo: any member reads it (the app shows it), owners and admins change it.
  app.get('/api/v1/organization/logo', async (request) => ok(await getOrganizationLogo(deps, await actorOf(request), {})));
  app.put('/api/v1/organization/logo', async (request) => ok(await setOrganizationLogo(deps, await actorOf(request), bodyOf(request))));

  await app.register(async (scope) => {
    await scope.register(multipart, { limits: CAREERS_MEDIA_MULTIPART_LIMITS });
    // Authorize before a byte of the body is read: up to 60 MB would otherwise be buffered for someone who may not upload.
    const mayManage = async (request: FastifyRequest): Promise<void> => authorize(await actorOf(request), 'careers_page:manage');
    scope.post(
      '/api/v1/careers-page/media',
      { bodyLimit: CAREERS_MEDIA_BODY_LIMIT, config: careersMediaRouteConfig(ctx), onRequest: mayManage },
      async (request, reply) => {
        const upload = await readCareersUpload(request);
        const asset = await uploadCareersMedia(deps, await actorOf(request), upload);
        return reply.status(201).send(ok(asset));
      },
    );
  });
}
