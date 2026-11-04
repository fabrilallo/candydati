import {
  archiveClient,
  createClient,
  getAgencySetting,
  getClient,
  getJobClient,
  listClients,
  listJobShortlists,
  revokeShortlist,
  sendShortlist,
  setAgencySetting,
  setJobClient,
  updateClient,
} from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { asBoolean, bodyOf, paramOf, queryOf } from './request.js';

/** Clients of an agency, the client of a job and shortlists (PRODUCT.md §3.5): thin adapters over the client use cases. */
export function registerClientRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.clientDeps;

  app.get('/api/v1/settings/agency', async (request) => ok(await getAgencySetting(deps, await ctx.resolveActor(request), {})));
  app.put('/api/v1/settings/agency', async (request) => ok(await setAgencySetting(deps, await ctx.resolveActor(request), request.body)));

  app.get('/api/v1/clients', async (request) =>
    ok(await listClients(deps, await ctx.resolveActor(request), { includeArchived: asBoolean(queryOf(request).includeArchived) ?? false })),
  );
  app.post('/api/v1/clients', async (request, reply) => reply.status(201).send(ok(await createClient(deps, await ctx.resolveActor(request), request.body))));
  app.get('/api/v1/clients/:id', async (request) => ok(await getClient(deps, await ctx.resolveActor(request), { clientId: paramOf(request, 'id') })));
  app.put('/api/v1/clients/:id', async (request) =>
    ok(await updateClient(deps, await ctx.resolveActor(request), { ...bodyOf(request), clientId: paramOf(request, 'id') })),
  );
  app.put('/api/v1/clients/:id/archived', async (request) =>
    ok(await archiveClient(deps, await ctx.resolveActor(request), { archived: bodyOf(request).archived, clientId: paramOf(request, 'id') })),
  );

  app.get('/api/v1/jobs/:id/client', async (request) => ok(await getJobClient(deps, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') })));
  app.put('/api/v1/jobs/:id/client', async (request) =>
    ok(await setJobClient(deps, await ctx.resolveActor(request), { ...bodyOf(request), jobId: paramOf(request, 'id') })),
  );

  const shortlists = ctx.shortlistDeps;
  app.get('/api/v1/jobs/:id/shortlists', async (request) =>
    ok(await listJobShortlists(shortlists, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') })),
  );
  app.post('/api/v1/jobs/:id/shortlists', async (request, reply) =>
    reply.status(201).send(ok(await sendShortlist(shortlists, await ctx.resolveActor(request), { ...bodyOf(request), jobId: paramOf(request, 'id') }))),
  );
  app.post('/api/v1/shortlists/:id/revoke', async (request) =>
    ok(await revokeShortlist(shortlists, await ctx.resolveActor(request), { shortlistId: paramOf(request, 'id') })),
  );
}
