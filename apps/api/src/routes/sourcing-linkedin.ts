import { acceptLinkedinRisk, getLinkedinStatus, prepareLinkedinResults, setLinkedinSetting } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { createSealer } from '../agent/sealed-ref.js';
import { sealedView } from '../agent/tools/sourcing-tools.js';
import { bodyOf } from './request.js';

const NO_STORE = 'no-store';

/** The LinkedIn handle of a profile link (`…/in/<handle>/`): taken out of what the model reads, like a surname. */
const handleOf = (profileUrl: string): string[] => [profileUrl.split('/in/')[1]?.split('/')[0] ?? ''].filter(Boolean);

/**
 * LinkedIn through the recruiter's own browser (the Candydati extension). The web app is the bridge between the assistant
 * and the extension: these routes say whether it may run, record the person's acceptance of the account risk, and seal
 * what the extension read so the model sees first names and facts only. Session only (internal routes).
 */
export function registerLinkedinSourcingRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.sourcingDeps;
  const sealer = createSealer(ctx.env.BETTER_AUTH_SECRET);
  app.get('/api/v1/sourcing/linkedin/status', async (request) => ok(await getLinkedinStatus(deps, await ctx.resolveActor(request), {})));

  app.post('/api/v1/sourcing/linkedin/accept', async (request) => ok(await acceptLinkedinRisk(deps, await ctx.resolveActor(request), bodyOf(request))));

  app.put('/api/v1/settings/linkedin-sourcing', async (request) => ok(await setLinkedinSetting(deps, await ctx.resolveActor(request), bodyOf(request))));

  // What the extension read, made ready for the assistant: first names and facts, the rest sealed (`agent/sealed-ref.ts`).
  app.post('/api/v1/sourcing/linkedin/results', async (request, reply) => {
    const actor = await ctx.resolveActor(request);
    const body = bodyOf(request);
    const found = await prepareLinkedinResults(deps, actor, body);
    const jobId = String((body as { jobId?: unknown }).jobId);
    const people = found.map((item) =>
      sealedView(sealer, actor.organizationId, jobId, {
        source: 'linkedin',
        firstName: item.firstName,
        lastName: item.lastName,
        location: item.profile.location,
        profileUrl: item.profile.profileUrl,
        status: item.status,
        evidence: item.evidence,
        otherIdentifiers: handleOf(item.profile.profileUrl),
      }),
    );
    return reply.header('cache-control', NO_STORE).send(ok({ jobId, order: 'LinkedIn search order; not a ranking', count: people.length, people }));
  });
}
