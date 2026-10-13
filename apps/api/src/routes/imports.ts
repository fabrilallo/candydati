import multipart from '@fastify/multipart';
import {
  createImportBatch,
  getImportBatch,
  listImports,
  requestImportCommit,
  setImportItems,
  toImportBatchPageDto,
  toUndoImportDto,
  undoImport,
  updateImportMapping,
} from '@tt/core';
import { ok } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { IMPORT_BODY_LIMIT, IMPORT_MULTIPART_LIMITS, readImportParts } from '../http/import-multipart.js';
import { toBatchViews, toPageView } from './import-view.js';
import { importUploadRouteConfig } from './limits.js';
import { asNumber, bodyOf, paramOf, queryOf } from './request.js';

const withoutUndefined = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

/**
 * Import of CVs, sheets and Notion exports (PLAN Fase 8). Session only: `import:manage` is never grantable to a key or the
 * agent, and a request carrying a bearer is refused before anything runs. The routes are thin: the use cases hold the rules.
 */
export async function registerImportRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const deps = ctx.importDeps;
  const pageOf = (view: Parameters<typeof toImportBatchPageDto>[0]) => toPageView(ctx, toImportBatchPageDto(view), view.batch);

  await app.register(async (scope) => {
    await scope.register(multipart, { limits: IMPORT_MULTIPART_LIMITS });
    scope.post('/api/v1/imports', { bodyLimit: IMPORT_BODY_LIMIT, config: importUploadRouteConfig(ctx) }, async (request, reply) => {
      const actor = await ctx.resolveSessionActor(request);
      const upload = await readImportParts(request);
      const batch = await createImportBatch(deps, actor, upload);
      return reply.status(201).send(ok({ id: batch.id, status: batch.status }));
    });
  });

  app.get('/api/v1/imports', async (request) => ok(await toBatchViews(ctx, await listImports(deps, await ctx.resolveSessionActor(request), {}))));

  app.get('/api/v1/imports/:id', async (request) => {
    const query = queryOf(request);
    const input = withoutUndefined({ batchId: paramOf(request, 'id'), page: asNumber(query.page), limit: asNumber(query.limit), confidence: query.confidence });
    return ok(await pageOf(await getImportBatch(deps, await ctx.resolveSessionActor(request), input)));
  });

  app.put('/api/v1/imports/:id/mapping', async (request) => {
    const body = bodyOf(request);
    const mapping = typeof body.mapping === 'object' && body.mapping !== null ? body.mapping : body;
    const view = await updateImportMapping(deps, await ctx.resolveSessionActor(request), { batchId: paramOf(request, 'id'), mapping });
    return ok(await pageOf(view));
  });

  app.put('/api/v1/imports/:id/items', async (request) => {
    const view = await setImportItems(deps, await ctx.resolveSessionActor(request), { ...bodyOf(request), batchId: paramOf(request, 'id') });
    return ok(await pageOf(view));
  });

  app.post('/api/v1/imports/:id/commit', async (request, reply) => {
    const batch = await requestImportCommit(deps, await ctx.resolveSessionActor(request), { batchId: paramOf(request, 'id') });
    return reply.status(202).send(ok((await toBatchViews(ctx, [batch]))[0]));
  });

  const undoView = async (result: Parameters<typeof toUndoImportDto>[0]) => ({ ...toUndoImportDto(result), batch: (await toBatchViews(ctx, [result.batch]))[0] });

  app.post('/api/v1/imports/:id/undo', async (request) =>
    ok(await undoView(await undoImport(deps, await ctx.resolveSessionActor(request), { batchId: paramOf(request, 'id') }))),
  );
}
