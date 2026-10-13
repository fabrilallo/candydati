import { z } from 'zod';
import { defineCandidateUseCase } from './define.js';
import { loadCandidateDetail, requireCandidate } from './shared.js';
import type { CandidateDetailView } from './views.js';

/** Every read of a profile is audited: it is personal data (PLAN §7). */
export const getCandidate = defineCandidateUseCase({
  name: 'getCandidate',
  input: z.object({ candidateId: z.string().min(1) }),
  permission: 'candidate:read',
  audit: {
    action: 'candidate.viewed',
    target: (input) => ({ type: 'candidate', id: input.candidateId }),
  },
  handler: async ({ deps, actor, input }): Promise<CandidateDetailView> =>
    loadCandidateDetail(deps, await requireCandidate(deps, actor.organizationId, input.candidateId)),
});
