import { TAG_MAX, TAGS_PER_CANDIDATE_MAX } from '@candydati/domain';
import { z } from 'zod';
import { defineCandidateUseCase } from './define.js';
import { loadCandidateDetail, requireCandidate } from './shared.js';
import type { CandidateDetailView } from './views.js';

const tagSchema = z.string().trim().toLowerCase().min(1).max(TAG_MAX);

/** Replaces the tag list. Tags are lowercase and unique. */
export const updateCandidateTags = defineCandidateUseCase({
  name: 'updateCandidateTags',
  input: z.object({
    candidateId: z.string().min(1),
    tags: z
      .array(tagSchema)
      .max(TAGS_PER_CANDIDATE_MAX)
      .transform((tags) => [...new Set(tags)]),
  }),
  permission: 'candidate:update',
  audit: {
    action: 'candidate.updated',
    target: (input) => ({ type: 'candidate', id: input.candidateId }),
    metadata: (input) => ({ fields: ['tags'], tagCount: input.tags.length }),
  },
  handler: async ({ deps, actor, input }): Promise<CandidateDetailView> => {
    const candidate = await requireCandidate(deps, actor.organizationId, input.candidateId);
    const saved = await deps.candidates.save({ ...candidate, tags: input.tags, updatedAt: deps.now() });
    return loadCandidateDetail(deps, saved);
  },
});
