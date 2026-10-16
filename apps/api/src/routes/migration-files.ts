import multipart from '@fastify/multipart';
import { authorize, createMigrationFromFiles, ValidationError } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../app-context.js';
import { MIGRATION_FILES_MULTIPART_LIMITS, readConnectorFiles } from '../http/migration-files-multipart.js';
import { MIGRATION_BODY_LIMIT } from '../http/migration-multipart.js';
import { importUploadRouteConfig } from './limits.js';
import { paramOf } from './request.js';

/**
 * Starts a migration from a file-based connector (`input: 'files'`), which has no credentials: the operator uploads the
 * export (one spreadsheet, optionally a ZIP of CVs) instead. Session only, `migration:manage`, authorized before a byte
 * of the body is read. The files wait in storage only until the fetch ends.
 */
export async function registerConnectorFilesRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const deps = ctx.migrationDeps;
  const actorOf = (request: FastifyRequest) => ctx.resolveSessionActor(request);
  await app.register(async (scope) => {
    await scope.register(multipart, { limits: MIGRATION_FILES_MULTIPART_LIMITS });
    const mayMigrate = async (request: FastifyRequest): Promise<void> => authorize(await actorOf(request), 'migration:manage');
    scope.post('/api/v1/migrations/connector/:connectorId/files', { bodyLimit: MIGRATION_BODY_LIMIT, config: importUploadRouteConfig(ctx), onRequest: mayMigrate }, async (request, reply) => {
      const actor = await actorOf(request);
      const connectorId = paramOf(request, 'connectorId');
      // Before a byte is stored: a connector this instance does not offer, or one that wants credentials, gets no upload.
      const source = deps.sources.find(connectorId);
      if (source?.input !== 'files') throw new ValidationError([{ path: 'connectorId', message: source === undefined ? 'connector_unknown' : 'connector_needs_credentials' }]);
      const batchId = deps.newId();
      const stored = await readConnectorFiles(request, { organizationId: actor.organizationId, batchId, files: deps.files });
      const batch = await createMigrationFromFiles(deps, actor, { connectorId, batchId, ...stored });
      return reply.status(201).send(ok({ id: batch.id, status: batch.status }));
    });
  });
}
