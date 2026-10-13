import { z } from 'zod';
import { defineCandidateUseCase } from './define.js';
import { NotFoundError } from '../../errors.js';
import { isVisibleApplication, loadCandidateDetail, requireCandidate } from './shared.js';
import type { CandidateDetailView } from './views.js';

/**
 * Every read of a profile is audited: it is personal data (PLAN §7). A candidate imported and not yet reconfirmed
 * (`to_renew`) is found only with `viaJobId`, the job of their import, and shows only that job's application; for
 * anyone else, or from anywhere else, they do not exist.
 */
export const getCandidate = defineCandidateUseCase({
  name: 'getCandidate',
  input: z.object({ candidateId: z.string().min(1), viaJobId: z.string().min(1).optional() }),
  permission: 'candidate:read',
  audit: {
    action: 'candidate.viewed',
    target: (input) => ({ type: 'candidate', id: input.candidateId }),
  },
  handler: async ({ deps, actor, input }): Promise<CandidateDetailView> => {
    const candidate = await requireCandidate(deps, actor.organizationId, input.candidateId);
    const detail = await loadCandidateDetail(deps, candidate, (application) => isVisibleApplication(application, input.viaJobId));
    if (detail.applications.length === 0) throw new NotFoundError('Candidate not found.');
    return detail;
  },
});
