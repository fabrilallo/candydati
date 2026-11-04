import { getJobScorecard, setJobScorecard } from '@candydati/core';
import { scorecardCriteriaInputSchema } from '@candydati/domain';
import { z } from 'zod';
import type { ToolDefinition } from './tool-support.js';

const jobId = z.string().min(1).describe('Id of the job ad, from list_jobs.');

export const getEvaluationCriteriaTool = {
  name: 'get_evaluation_criteria',
  title: 'Read the evaluation criteria of a job',
  description:
    'Read what interviewers look for in a job, declared before the interviews: each criterion with its stage (null: every stage) and whether a feedback already used it (`locked`). ' +
    'There is no weight or score: an interviewer records observed, not observed or to explore, with evidence. Read only.',
  shape: { jobId },
  readOnly: true,
  run: async ({ app, actor }, input) => getJobScorecard(app.feedbackDeps, actor, input),
} satisfies ToolDefinition<{ jobId: typeof jobId }>;

const criteria = scorecardCriteriaInputSchema.describe(
  'The whole list, in order: it replaces the active criteria. Keep the `id` of an existing criterion to keep it; a criterion without `id` is new. Short labels tied to the ad, no weights.',
);

export const setEvaluationCriteriaTool = {
  name: 'set_evaluation_criteria',
  title: 'Set the evaluation criteria of a job',
  description:
    'Replace the evaluation criteria of a job with the list given, after the person agreed to it. A locked criterion (used by a feedback) keeps its words and stage; leaving it out retires it, so past feedback reads as written. ' +
    'Criteria describe what to look for; they never score, weigh or order candidates.',
  shape: { jobId, criteria },
  readOnly: false,
  run: async ({ app, actor }, input) => {
    const { changes: _changes, ...view } = await setJobScorecard(app.feedbackDeps, actor, input);
    return view;
  },
} satisfies ToolDefinition<{ jobId: typeof jobId; criteria: typeof criteria }>;
