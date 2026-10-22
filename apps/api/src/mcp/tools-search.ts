import { CRITERIA_POOLS, findCandidatesByCriteria } from '@candydati/core';
import { candidateCriteriaSchema } from '@candydati/domain';
import { z } from 'zod';
import type { ToolDefinition } from './tool-support.js';

const shape = {
  jobId: z.string().min(1).describe('Id of the job ad, from list_jobs.'),
  criteria: candidateCriteriaSchema.describe(
    'Objective, job-related criteria: skills, languages, minYearsOfExperience, locations (any of), keywords (words in the CV). At least one. No maximum experience and no protected characteristic.',
  ),
  pool: z.enum(CRITERIA_POOLS).optional().describe('applicants of the job, talent_pool, or both (default).'),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  confirmedByUser: z.literal(true).describe('true only after the person you work for explicitly confirmed these exact criteria.'),
};

export const findCandidatesTool = {
  name: 'find_candidates_by_criteria',
  title: 'Find candidates by objective criteria',
  description:
    'Candidates for ONE job whose CV meets every criterion the person confirmed (skills, languages, minimum experience, location, words in the CV). ' +
    'Searches the job\'s applicants and the talent pool only, the people whose consent covers this job. A filter, not a ranking: no score, ordered by date of application. ' +
    'Results carry first name and id only. notEvaluable counts CVs that could not be checked: a person must look at them. Protected characteristics are refused. Read only, audited.',
  shape,
  readOnly: true,
  run: async ({ app, actor }, input) => {
    const { confirmedByUser: _confirmed, ...query } = input;
    const result = await findCandidatesByCriteria(app.candidateDeps, actor, query);
    return {
      job: result.job,
      criteria: result.criteria,
      pool: result.pool,
      items: result.items.map((item) => ({ candidateId: item.candidate.id, firstName: item.candidate.firstName, applicationId: item.applicationId, inTalentPool: item.candidate.talentPool })),
      notEvaluable: result.notEvaluable,
      order: 'most recent application first; not a ranking',
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  },
} satisfies ToolDefinition<typeof shape>;
