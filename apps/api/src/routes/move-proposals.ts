import { confirmMoveProposal, dismissMoveProposal, listMoveProposals, toApplicationCardDto, toMoveProposalDto } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { asNumber, paramOf, queryOf } from './request.js';

/**
 * Proposals of `propose_move` rules. They are suggestions: confirming one runs the normal move with the confirming
 * person's permission and audit; dismissing one moves nothing.
 */
export function registerMoveProposalRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.proposalDeps;

  app.get('/api/v1/move-proposals', async (request) => {
    const query = queryOf(request);
    const input = { ...(query.applicationId === undefined ? {} : { applicationId: query.applicationId }), ...(query.limit === undefined ? {} : { limit: asNumber(query.limit) }) };
    return ok((await listMoveProposals(deps, await ctx.resolveActor(request), input)).map(toMoveProposalDto));
  });

  app.post('/api/v1/move-proposals/:id/confirm', async (request) => {
    const result = await confirmMoveProposal(deps, await ctx.resolveActor(request), { proposalId: paramOf(request, 'id') });
    return ok({ proposalId: result.proposal.id, application: toApplicationCardDto(result.moved) });
  });

  app.post('/api/v1/move-proposals/:id/dismiss', async (request) => {
    const proposal = await dismissMoveProposal(deps, await ctx.resolveActor(request), { proposalId: paramOf(request, 'id') });
    return ok({ proposalId: proposal.id, dismissed: true });
  });
}
