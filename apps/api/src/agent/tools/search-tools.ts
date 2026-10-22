import { createTool } from '@mastra/core/tools';
import { CRITERIA_POOLS, findCandidatesByCriteria, type CandidateDeps } from '@candydati/core';
import { candidateCriteriaSchema } from '@candydati/domain';
import { z } from 'zod';
import { wrapCandidateData } from '../candidate-data.js';
import { readAgentIdentity } from '../request-context.js';
import { runTool } from '../tool-result.js';

export const createFindCandidatesTool = (deps: CandidateDeps) =>
  createTool({
    id: 'find_candidates_by_criteria',
    description:
      'Finds the candidates for ONE job whose CV meets objective, job-related criteria: skills, languages, minimum years of experience, location, words in the CV. ' +
      'Only the job\'s applicants and the talent pool are searched (the people whose consent covers this job). Every result meets every criterion: it is a filter, not a ranking, ' +
      'and the order is the date of application. Before calling, list the criteria to the user and wait for their explicit confirmation; then set confirmedByUser. ' +
      'Never use age, sex, origin, family or other protected characteristics: they are refused. Results carry first name and id only; notEvaluable counts CVs nobody could check, which a person must look at.',
    inputSchema: z.object({
      jobId: z.string().min(1).max(100),
      criteria: candidateCriteriaSchema,
      pool: z.enum(CRITERIA_POOLS).default('both'),
      page: z.number().int().min(1).default(1),
      confirmedByUser: z.literal(true).describe('true only after the user explicitly confirmed these exact criteria in this chat.'),
    }),
    execute: async (input, context) =>
      runTool(async () => {
        const { confirmedByUser: _confirmed, ...query } = input;
        const result = await findCandidatesByCriteria(deps, readAgentIdentity(context?.requestContext).actor, { ...query, limit: 25 });
        return {
          job: result.job,
          criteria: result.criteria,
          pool: result.pool,
          total: result.total,
          notEvaluable: result.notEvaluable,
          page: result.page,
          order: 'most recent application first; not a ranking',
          items: result.items.map((item) => ({
            candidateId: item.candidate.id,
            firstName: wrapCandidateData(item.candidate.firstName),
            applicationId: item.applicationId,
            inTalentPool: item.candidate.talentPool,
          })),
        };
      }),
  });
