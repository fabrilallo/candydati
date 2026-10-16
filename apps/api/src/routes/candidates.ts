import {
  addCandidateNote,
  getApplicationTimeline,
  getCandidate,
  searchCandidates,
  toApplicationTimelineDto,
  toCandidateDetailDto,
  toCandidateSummaryDtos,
  toNoteDto,
  updateCandidateTags,
} from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { asBoolean, asNumber, bodyOf, paramOf, queryOf } from './request.js';

const searchInput = (query: Readonly<Record<string, unknown>>) => ({
  query: query.query,
  tag: query.tag,
  talentPool: asBoolean(query.talentPool),
  page: asNumber(query.page),
  limit: asNumber(query.limit),
});

const withoutUndefined = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

/** Search, profile, tags and notes. Opening a profile is audited by the use case. */
export function registerCandidateRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.candidateDeps;
  const candidateId = (request: Parameters<typeof paramOf>[0]) => paramOf(request, 'id');

  app.get('/api/v1/candidates', async (request) => {
    const page = await searchCandidates(deps, await ctx.resolveActor(request), withoutUndefined(searchInput(queryOf(request))));
    return ok(toCandidateSummaryDtos(page), { total: page.total, page: page.page, limit: page.limit });
  });

  // `viaJobId`: a candidate still to reconfirm is reachable only from the pipeline of the job they were imported into.
  // The client says which pipeline it comes from; the visibility rule itself lives in core.
  app.get('/api/v1/candidates/:id', async (request) => {
    const actor = await ctx.resolveActor(request);
    const viaJobId = queryOf(request).viaJobId;
    return ok(toCandidateDetailDto(await getCandidate(deps, actor, withoutUndefined({ candidateId: candidateId(request), viaJobId }))));
  });

  app.get('/api/v1/applications/:id/timeline', async (request) => {
    const input = withoutUndefined({ applicationId: paramOf(request, 'id'), viaJobId: queryOf(request).viaJobId });
    return ok(toApplicationTimelineDto(await getApplicationTimeline(ctx.timelineDeps, await ctx.resolveActor(request), input)));
  });

  app.patch('/api/v1/candidates/:id', async (request) => {
    const input = { ...bodyOf(request), candidateId: candidateId(request) };
    return ok(toCandidateDetailDto(await updateCandidateTags(deps, await ctx.resolveActor(request), input)));
  });

  app.post('/api/v1/candidates/:id/notes', async (request, reply) => {
    const input = { ...bodyOf(request), candidateId: candidateId(request) };
    const view = await addCandidateNote(deps, await ctx.resolveActor(request), input);
    return reply.status(201).send(ok(toNoteDto(view)));
  });
}
