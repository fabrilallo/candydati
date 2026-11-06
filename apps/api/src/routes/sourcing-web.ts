import { prepareWebResults } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { createSealer } from '../agent/sealed-ref.js';
import { sealedView } from '../agent/tools/sourcing-tools.js';
import { bodyOf } from './request.js';

const NO_STORE = 'no-store';

/**
 * Web search through the recruiter's own browser (the Candydati extension opens Google there). The web app is the bridge
 * between the assistant and the extension: this route seals what the extension read so the model sees first names and
 * facts only, exactly like the LinkedIn results. Session only (internal route).
 */
export function registerWebSourcingRoutes(app: FastifyInstance, ctx: AppContext): void {
  const sealer = createSealer(ctx.env.BETTER_AUTH_SECRET);
  app.post('/api/v1/sourcing/web/results', async (request, reply) => {
    const actor = await ctx.resolveActor(request);
    const body = bodyOf(request);
    const found = await prepareWebResults(ctx.sourcingDeps, actor, body);
    const jobId = String((body as { jobId?: unknown }).jobId);
    const people = found.map(({ person, status, evidence }) =>
      sealedView(sealer, actor.organizationId, jobId, {
        source: person.source,
        firstName: person.firstName,
        lastName: person.lastName,
        location: person.location,
        profileUrl: person.profileUrl,
        status,
        evidence,
        otherIdentifiers: person.handle ? [person.handle] : [],
      }),
    );
    return reply.header('cache-control', NO_STORE).send(ok({ jobId, order: 'Google result order; not a ranking', count: people.length, people }));
  });
}
