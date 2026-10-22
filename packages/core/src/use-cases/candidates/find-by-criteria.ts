import { candidateCriteriaSchema, describeCriteria } from '@candydati/domain';
import { z } from 'zod';
import { CRITERIA_POOLS, type CriteriaMatch, type CriteriaPool } from '../../candidate-ports.js';
import { requireJob } from '../jobs/shared.js';
import { defineCandidateUseCase } from './define.js';

export const CRITERIA_PAGE_MAX = 50;

export interface CriteriaSearchPage {
  readonly job: { readonly id: string; readonly title: string };
  /** The criteria in plain words, as the person confirmed them. */
  readonly criteria: readonly string[];
  readonly pool: CriteriaPool;
  /** Most recently applied first: an order of time, never of merit. */
  readonly items: readonly CriteriaMatch[];
  readonly total: number;
  /** Candidates of the pool whose CV could not be checked: a person looks at them, they are not excluded. */
  readonly notEvaluable: number;
  readonly page: number;
  readonly limit: number;
}

/**
 * Candidates for one job who meet objective criteria a person declared (skills, languages, minimum experience,
 * location, words in the CV). A filter, not a judgement: every result meets every criterion, there is no score and
 * no ranking. Only the job's applicants and the talent pool are searched, the people whose consent covers this job.
 */
export const findCandidatesByCriteria = defineCandidateUseCase({
  name: 'findCandidatesByCriteria',
  input: z.object({
    jobId: z.string().min(1),
    criteria: candidateCriteriaSchema,
    pool: z.enum(CRITERIA_POOLS).default('both'),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(CRITERIA_PAGE_MAX).default(25),
  }),
  permission: 'candidate:read',
  audit: {
    action: 'candidate.searched_by_criteria',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (input, result: CriteriaSearchPage) => ({ criteria: describeCriteria(input.criteria), pool: input.pool, total: result.total }),
  },
  handler: async ({ deps, actor, input }): Promise<CriteriaSearchPage> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    const { items, total, notEvaluable } = await deps.candidateSearch.findByCriteria({
      organizationId: actor.organizationId,
      jobId: job.id,
      pool: input.pool,
      criteria: input.criteria,
      page: input.page,
      limit: input.limit,
    });
    return { job: { id: job.id, title: job.content.title }, criteria: describeCriteria(input.criteria), pool: input.pool, items, total, notEvaluable, page: input.page, limit: input.limit };
  },
});
