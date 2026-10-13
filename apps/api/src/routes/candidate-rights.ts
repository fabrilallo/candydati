import { correctCandidate, eraseCandidate, exportCandidate, toCandidateDetailDto, zipCandidateExport } from '@tt/core';
import { ok } from '@tt/domain';
import { zipWriterFactory } from '@tt/providers';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { sendZip } from '../http/zip-download.js';
import { bodyOf, paramOf } from './request.js';

/** Access, rectification and erasure of one candidate (PRODUCT.md §6). Thin adapters over the use cases. */
export function registerCandidateRightsRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.rightsDeps;

  app.get('/api/v1/candidates/:id/export', async (request, reply) => {
    const candidateId = paramOf(request, 'id');
    const bundle = await exportCandidate(deps, await ctx.resolveActor(request), { candidateId });
    return sendZip(reply, await zipCandidateExport(zipWriterFactory(), bundle), `candidate-${candidateId}.zip`);
  });

  app.patch('/api/v1/candidates/:id/details', async (request) => {
    const { detail } = await correctCandidate(deps, await ctx.resolveActor(request), { candidateId: paramOf(request, 'id'), changes: bodyOf(request) });
    return ok(toCandidateDetailDto(detail));
  });

  app.post('/api/v1/candidates/:id/erase', async (request) => {
    await eraseCandidate(deps, await ctx.resolveActor(request), { candidateId: paramOf(request, 'id'), confirmName: bodyOf(request).confirmName });
    return ok({ erased: true as const });
  });
}
