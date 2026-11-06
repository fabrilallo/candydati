import {
  addSourcedContacts,
  deleteSourcedContact,
  getSourcingSetting,
  listSourcedContacts,
  markSourcedContacted,
  objectToSourcing,
  setSourcingSetting,
  sourcedNoticeText,
  toAddSourcedResultDto,
  toSourcedContactDto,
  toSourcingNoticeViewDto,
  viewSourcingNotice,
} from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { feedbackRouteConfig } from './limits.js';
import { bodyOf, paramOf, queryOf } from './request.js';

const NO_STORE = 'no-store';

/**
 * Sourcing: people found outside Candydati for a job become contacts (never candidates), with a personal GDPR art. 14
 * notice link. Contacts are reached through their job, with the same per-job access as candidates.
 */
export function registerSourcingRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.sourcingDeps;

  app.get('/api/v1/jobs/:id/sourced-contacts', async (request) =>
    ok((await listSourcedContacts(deps, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') })).map(toSourcedContactDto)),
  );

  // The answer carries each new contact's notice link once: it is not stored in clear and never listed again.
  app.post('/api/v1/jobs/:id/sourced-contacts', async (request, reply) => {
    const results = await addSourcedContacts(deps, await ctx.resolveActor(request), { ...bodyOf(request), jobId: paramOf(request, 'id') });
    return reply.status(201).header('cache-control', NO_STORE).send(ok(results.map(toAddSourcedResultDto)));
  });

  app.post('/api/v1/sourced-contacts/:id/notice', async (request, reply) =>
    reply.header('cache-control', NO_STORE).send(ok(await sourcedNoticeText(deps, await ctx.resolveActor(request), { contactId: paramOf(request, 'id') }))),
  );

  app.post('/api/v1/sourced-contacts/:id/contacted', async (request) =>
    ok(toSourcedContactDto(await markSourcedContacted(deps, await ctx.resolveActor(request), { contactId: paramOf(request, 'id') }))),
  );

  app.delete('/api/v1/sourced-contacts/:id', async (request) =>
    ok(await deleteSourcedContact(deps, await ctx.resolveActor(request), { contactId: paramOf(request, 'id'), doNotContact: queryOf(request).doNotContact === 'true' })),
  );

  app.get('/api/v1/settings/sourcing', async (request) => ok(await getSourcingSetting(deps, await ctx.resolveActor(request), {})));

  app.put('/api/v1/settings/sourcing', async (request) => ok(await setSourcingSetting(deps, await ctx.resolveActor(request), bodyOf(request))));

  // The person's own page, from the link of their notice: the token is the only credential, no session is read.
  const config = feedbackRouteConfig(ctx);
  app.get('/api/v1/public/sourcing-notice/:token', { config }, async (request, reply) =>
    reply.header('cache-control', NO_STORE).send(ok(toSourcingNoticeViewDto(await viewSourcingNotice(deps, { token: paramOf(request, 'token') })))),
  );

  app.post('/api/v1/public/sourcing-notice/:token/object', { config }, async (request, reply) => {
    await objectToSourcing(deps, { token: paramOf(request, 'token') });
    return reply.header('cache-control', NO_STORE).send(ok({ erased: true }));
  });
}
