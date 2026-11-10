import { findCandidatesByCriteria } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, paramOf } from './request.js';

const NO_STORE = 'no-store';
const PAGE_SIZE = 25;

/**
 * The talent pool search of a job page: candidates of the organization whose consent covers future positions, whose CV
 * meets every criterion the recruiter set. Shown in clear on the recruiter's screen, never to a model (the assistant has
 * `find_candidates_by_criteria`, pseudonymous). A filter, not a ranking: most recent application first. Read only and
 * audited by the use case. Session only (internal route).
 */
export function registerTalentPoolRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/v1/jobs/:id/talent-pool/search', async (request, reply) => {
    const body = bodyOf(request) as { criteria?: unknown; page?: unknown };
    const jobId = paramOf(request, 'id');
    const result = await findCandidatesByCriteria(ctx.candidateDeps, await ctx.resolveSessionActor(request), { jobId, criteria: body.criteria, page: body.page, pool: 'talent_pool', limit: PAGE_SIZE });
    const people = result.items.map(({ candidate, applicationId, lastAppliedAt, skillMatches }) => ({
      candidateId: candidate.id,
      fullName: `${candidate.firstName} ${candidate.lastName}`.trim(),
      appliedToThisJob: applicationId !== null,
      lastAppliedAt: lastAppliedAt?.toISOString() ?? null,
      skillMatches: skillMatches.map((match) => ({ criterion: match.criterion, matchedAs: match.matchedAs })),
    }));
    return reply.header('cache-control', NO_STORE).send(
      ok({ order: 'most recent application first; not a ranking', criteria: result.criteria, total: result.total, notEvaluable: result.notEvaluable, page: result.page, limit: result.limit, people }),
    );
  });
}
