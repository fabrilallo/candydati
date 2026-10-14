import { checkPublishable, jobContentSchema, type JobContent, type PublishIssue } from '@tt/domain';
import { z } from 'zod';
import type { JobDeps } from '../../job-ports.js';
import { defineUseCase } from '../../use-case.js';
import { requireJob } from './shared.js';

export const JOB_BRIEF_MAX = 4000;

/** Writes a job ad proposal from a brief with a model (Mastra, in the api). The result is re-validated here. */
export type JobContentDrafter = (input: { readonly brief: string; readonly base: JobContent | null; readonly language: 'it' | 'en' }) => Promise<unknown>;

export interface DraftJobDeps extends Pick<JobDeps, 'auditLog' | 'transaction' | 'jobs'> {
  readonly drafter: JobContentDrafter;
  /** The model failed or answered something that is not a job ad: the caller gets `failed`, the cause goes here. */
  readonly onDraftError?: ((error: unknown) => void) | undefined;
}

export type DraftJobContentResult =
  | { readonly status: 'proposed'; readonly proposal: JobContent; readonly publishIssues: readonly PublishIssue[] }
  | { readonly status: 'failed' };

const inputSchema = z.object({ brief: z.string().trim().min(1).max(JOB_BRIEF_MAX), jobId: z.string().min(1).optional(), language: z.enum(['it', 'en']).default('it') });

/**
 * A proposal for a job ad (optionally improving a saved one). Nothing is saved: a person saves it with `updateJob`. The
 * model output is data, validated with `jobContentSchema`; a failure is an answer (`failed`), never a crash of the chat.
 */
export const draftJobContent = defineUseCase<DraftJobDeps, typeof inputSchema, DraftJobContentResult>({
  name: 'draftJobContent',
  input: inputSchema,
  permission: 'job:update',
  audit: { skip: 'nothing is saved: a proposal only' },
  transaction: { skip: 'a model call must not hold a transaction' },
  handler: async ({ deps, actor, input }): Promise<DraftJobContentResult> => {
    const base = input.jobId ? (await requireJob(deps, actor.organizationId, input.jobId)).content : null;
    try {
      const proposal = jobContentSchema.parse(await deps.drafter({ brief: input.brief, base, language: input.language }));
      return { status: 'proposed', proposal, publishIssues: checkPublishable(proposal) };
    } catch (error) {
      deps.onDraftError?.(error);
      return { status: 'failed' };
    }
  },
});
