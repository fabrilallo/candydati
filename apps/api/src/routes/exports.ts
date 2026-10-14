import { listExports, openExport, requestOrganizationExport } from '@tt/core';
import { ok } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { sendZipStream } from '../http/zip-download.js';
import { toDataExportDto } from './privacy-dto.js';
import { paramOf } from './request.js';

/** Organization export: requested here, built by the worker (`organization.export`), downloaded until it expires. */
export function registerExportRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.exportDeps;

  app.post('/api/v1/exports', async (request, reply) => {
    const created = await requestOrganizationExport(deps, await ctx.resolveActor(request), {});
    return reply.status(202).send(ok({ id: created.id, status: created.status }));
  });

  app.get('/api/v1/exports', async (request) => ok((await listExports(deps, await ctx.resolveActor(request), {})).map(toDataExportDto)));

  app.get('/api/v1/exports/:id/download', async (request, reply) => {
    const file = await openExport(deps, await ctx.resolveActor(request), { exportId: paramOf(request, 'id') });
    return sendZipStream(reply, file.stream, file.sizeBytes, file.fileName);
  });
}
