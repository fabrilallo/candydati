import { scorecardSuggestionsSchema, SUGGESTED_CRITERIA_MAX, type Job, type Locale } from '@candydati/domain';
import { z } from 'zod';
import type { CoreDeps } from '../../ports.js';
import type { JobRepository } from '../../job-ports.js';
import type { ScorecardRepository } from '../../feedback-ports.js';
import { defineUseCase } from '../../use-case.js';
import { requireJob } from '../jobs/shared.js';

/** What the model may see: the ad's own words and the criteria already written. Never anything about a candidate. */
export interface CriteriaContext {
  readonly language: Locale;
  readonly title: string;
  readonly responsibilities: readonly string[];
  readonly requirements: readonly string[];
  readonly preferred: readonly string[];
  readonly stages: readonly string[];
  readonly existing: readonly string[];
}

/** The fast model behind a port (Mastra, in the api). `available` follows the AI settings in force at each call. */
export interface CriteriaDrafter {
  available(): boolean;
  draft(context: CriteriaContext): Promise<unknown>;
}

export interface SuggestScorecardDeps extends CoreDeps {
  readonly jobs: JobRepository;
  readonly scorecards: ScorecardRepository;
  readonly criteriaDrafter: CriteriaDrafter;
  /** The model failed or answered out of shape: the caller gets `failed`, the cause goes here (never the ad text). */
  readonly onSuggestError?: ((error: unknown) => void) | undefined;
}

export type SuggestScorecardResult = { readonly status: 'proposed'; readonly criteria: readonly string[] } | { readonly status: 'unavailable' | 'failed' };

const normalized = (line: string): string => line.trim().toLowerCase().replace(/\s+/g, ' ');

export function criteriaContextOf(job: Job, existing: readonly string[]): CriteriaContext {
  const { content } = job;
  return {
    language: content.language,
    title: content.title,
    responsibilities: content.responsibilities,
    requirements: content.requirements.mustHave,
    preferred: content.requirements.niceToHave,
    stages: content.process.map((stage) => stage.title ?? stage.type),
    existing,
  };
}

/**
 * Drafts evaluation criteria for a job from its ad (PRODUCT.md §3.1): what interviewers could look for, as short labels.
 * Nothing is saved: a person keeps the ones they want. The model sees the ad only and never evaluates a candidate. Its
 * answer is data (Zod); a failure is an answer (`failed`). Audited without a transaction: a model call must not hold one.
 */
export const suggestScorecardCriteria = defineUseCase<SuggestScorecardDeps, z.ZodObject<{ jobId: z.ZodString }>, SuggestScorecardResult>({
  name: 'suggestScorecardCriteria',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'feedback:manage',
  audit: {
    action: 'job.scorecard_suggested',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (_input, result) => ({ status: result.status, ...(result.status === 'proposed' ? { count: result.criteria.length } : {}) }),
  },
  transaction: { skip: 'a model call must not hold a transaction; the audit row is one append' },
  handler: async ({ deps, actor, input }): Promise<SuggestScorecardResult> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    if (!deps.criteriaDrafter.available()) return { status: 'unavailable' };
    const existing = (await deps.scorecards.listByJob(actor.organizationId, job.id)).filter((c) => c.retiredAt === null).map((c) => c.label);
    try {
      const answer = scorecardSuggestionsSchema.parse(await deps.criteriaDrafter.draft(criteriaContextOf(job, existing)));
      const seen = new Set(existing.map(normalized));
      const criteria = answer.criteria.filter((label) => !seen.has(normalized(label)) && seen.add(normalized(label))).slice(0, SUGGESTED_CRITERIA_MAX);
      return criteria.length > 0 ? { status: 'proposed', criteria } : { status: 'failed' };
    } catch (error) {
      deps.onSuggestError?.(error);
      return { status: 'failed' };
    }
  },
});
