import { addJobTeamMember, getAccessSetting, getJobTeam, removeJobTeamMember, setAccessSetting } from '@tt/core';
import { ok } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, paramOf } from './request.js';

/** The team of a job and the recruiter access setting: thin adapters over the job team use cases. */
export function registerJobTeamRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.jobTeamDeps;
  const jobId = (request: Parameters<typeof paramOf>[0]) => ({ jobId: paramOf(request, 'id') });

  app.get('/api/v1/jobs/:id/team', async (request) => ok(await getJobTeam(deps, await ctx.resolveActor(request), jobId(request))));

  app.put('/api/v1/jobs/:id/team/:userId', async (request) =>
    ok(await addJobTeamMember(deps, await ctx.resolveActor(request), { ...bodyOf(request), ...jobId(request), userId: paramOf(request, 'userId') })),
  );

  app.delete('/api/v1/jobs/:id/team/:userId', async (request) =>
    ok(await removeJobTeamMember(deps, await ctx.resolveActor(request), { ...jobId(request), userId: paramOf(request, 'userId') })),
  );

  app.get('/api/v1/settings/access', async (request) => ok(await getAccessSetting(ctx.accessSettingDeps, await ctx.resolveActor(request), {})));

  app.put('/api/v1/settings/access', async (request) => ok(await setAccessSetting(ctx.accessSettingDeps, await ctx.resolveActor(request), request.body)));
}
