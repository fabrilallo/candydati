import multipart from '@fastify/multipart';
import {
  authorize,
  createMigrationFromConnector,
  createMigrationFromPackage,
  listMigrationConnectors,
  getMigration,
  listMigrationIssues,
  listMigrations,
  requestMigrationCommit,
  undoMigration,
  updateMigrationChoices,
} from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../app-context.js';
import { MIGRATION_BODY_LIMIT, MIGRATION_MULTIPART_LIMITS, readMigrationPackage } from '../http/migration-multipart.js';
import { toIssueView, toMigrationView } from './migration-view.js';
import { importUploadRouteConfig } from './limits.js';
import { asNumber, bodyOf, paramOf, queryOf } from './request.js';

const withoutUndefined = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

/**
 * Migration from another ATS through a package (ADR 0009). Session only: `migration:manage` (owner and admin) is never
 * grantable to a key or the agent, and a bearer is refused before anything runs. The routes are thin: the use cases
 * hold the rules. A connector start (`POST /api/v1/migrations/connector`) carries the source's credentials: the body is
 * never logged (request logs hold method and url only), the credentials are sealed by the use case and never returned.
 */
export async function registerMigrationRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const deps = ctx.migrationDeps;
  const actorOf = (request: FastifyRequest) => ctx.resolveSessionActor(request);

  await app.register(async (scope) => {
    await scope.register(multipart, { limits: MIGRATION_MULTIPART_LIMITS });
    // Authorize before a byte of the body is read: up to 1 GiB would otherwise be stored for someone who may not migrate.
    const mayMigrate = async (request: FastifyRequest): Promise<void> => authorize(await actorOf(request), 'migration:manage');
    scope.post('/api/v1/migrations', { bodyLimit: MIGRATION_BODY_LIMIT, config: importUploadRouteConfig(ctx), onRequest: mayMigrate }, async (request, reply) => {
      const actor = await actorOf(request);
      const stored = await readMigrationPackage(request, { organizationId: actor.organizationId, newId: deps.newId, files: deps.files });
      const batch = await createMigrationFromPackage(deps, actor, { batchId: stored.batchId, file: { key: stored.key, sizeBytes: stored.sizeBytes } });
      return reply.status(201).send(ok({ id: batch.id, status: batch.status }));
    });
  });

  app.get('/api/v1/migrations/connectors', async (request) => ok(await listMigrationConnectors(deps, await actorOf(request), {})));

  app.post('/api/v1/migrations/connector', { config: importUploadRouteConfig(ctx) }, async (request, reply) => {
    const batch = await createMigrationFromConnector(deps, await actorOf(request), bodyOf(request));
    return reply.status(201).send(ok({ id: batch.id, status: batch.status }));
  });

  app.get('/api/v1/migrations', async (request) => ok((await listMigrations(deps, await actorOf(request), {})).map(toMigrationView)));

  app.get('/api/v1/migrations/:id', async (request) => ok(toMigrationView(await getMigration(deps, await actorOf(request), { migrationId: paramOf(request, 'id') }))));

  app.get('/api/v1/migrations/:id/issues', async (request) => {
    const query = queryOf(request);
    const input = withoutUndefined({ migrationId: paramOf(request, 'id'), page: asNumber(query.page), limit: asNumber(query.limit), level: query.level });
    const view = await listMigrationIssues(deps, await actorOf(request), input);
    return ok({ ...view, items: view.items.map(toIssueView) });
  });

  app.put('/api/v1/migrations/:id/choices', async (request) => {
    const batch = await updateMigrationChoices(deps, await actorOf(request), { ...bodyOf(request), migrationId: paramOf(request, 'id') });
    return ok(toMigrationView(batch));
  });

  app.post('/api/v1/migrations/:id/commit', async (request, reply) => {
    const batch = await requestMigrationCommit(deps, await actorOf(request), { ...bodyOf(request), migrationId: paramOf(request, 'id') });
    return reply.status(202).send(ok(toMigrationView(batch)));
  });

  app.post('/api/v1/migrations/:id/undo', async (request) => {
    const result = await undoMigration(deps, await actorOf(request), { migrationId: paramOf(request, 'id') });
    return ok({ batch: toMigrationView(result.batch), counts: result.counts });
  });
}
