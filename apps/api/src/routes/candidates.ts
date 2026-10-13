import {
  addCandidateNote,
  getCandidate,
  searchCandidates,
  toCandidateDetailDto,
  toCandidateSummaryDtos,
  toNoteDto,
  updateCandidateTags,
} from '@tt/core';
import { ok } from '@tt/domain';
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
  // Opening a person from the pipeline of their job: the job of their own application waiting for reconfirmation.
  // Only a hint; `getCandidate` still checks the permission and the organization.
  const pendingJobOf = async (organizationId: string, id: string): Promise<string | undefined> =>
    (await deps.applications.listByCandidate(organizationId, id)).find((application) => application.consentStatus === 'to_renew')?.jobId;
  const candidateId = (request: Parameters<typeof paramOf>[0]) => paramOf(request, 'id');

  app.get('/api/v1/candidates', async (request) => {
    const page = await searchCandidates(deps, await ctx.resolveActor(request), withoutUndefined(searchInput(queryOf(request))));
    return ok(toCandidateSummaryDtos(page), { total: page.total, page: page.page, limit: page.limit });
  });

  // `viaJobId`: a candidate still to reconfirm is reachable only from the pipeline of the job they were imported into.
  app.get('/api/v1/candidates/:id', async (request) => {
    const actor = await ctx.resolveActor(request);
    const id = candidateId(request);
    const viaJobId = queryOf(request).viaJobId ?? (await pendingJobOf(actor.organizationId, id));
    return ok(toCandidateDetailDto(await getCandidate(deps, actor, withoutUndefined({ candidateId: id, viaJobId }))));
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
