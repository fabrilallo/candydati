import { z } from 'zod';
import type { CandidateSummary } from '../../candidate-ports.js';
import { defineCandidateUseCase } from './define.js';

export const CANDIDATE_PAGE_MAX = 100;

export interface CandidatePage {
  readonly items: readonly CandidateSummary[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

/** Name, email, tags and CV text. Listing only: opening a profile is what gets audited. */
export const searchCandidates = defineCandidateUseCase({
  name: 'searchCandidates',
  input: z.object({
    query: z.string().trim().max(100).optional(),
    tag: z.string().trim().toLowerCase().min(1).max(40).optional(),
    talentPool: z.boolean().optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(CANDIDATE_PAGE_MAX).default(25),
  }),
  permission: 'candidate:read',
  audit: { skip: 'listing: opening a candidate profile or CV is what gets audited' },
  handler: async ({ deps, actor, input }): Promise<CandidatePage> => {
    const { items, total } = await deps.candidateSearch.search({
      organizationId: actor.organizationId,
      query: input.query === '' ? undefined : input.query,
      tag: input.tag,
      talentPool: input.talentPool,
      page: input.page,
      limit: input.limit,
    });
    return { items, total, page: input.page, limit: input.limit };
  },
});
