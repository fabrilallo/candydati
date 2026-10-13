import { adQualityReportSchema, assess, checkPublishable, type AdQualityAssessment, type AdQualityReport, type Job } from '@tt/domain';
import { z } from 'zod';
import { ConflictError } from '../../errors.js';
import type { JobDeps } from '../../job-ports.js';
import { defineJobUseCase } from './define.js';
import { issuesToValidationError, requireJob } from './shared.js';

export interface PublishJobResult {
  readonly job: Job;
  /** Null only when the analysis failed: publication never waits on the score (PLAN §5.2). */
  readonly quality: AdQualityAssessment | null;
}

/** A failing or malformed analysis yields null: the caller sees it in `quality: null`, the ad is still published. */
async function tryAnalyze(deps: JobDeps, job: Job): Promise<AdQualityReport | null> {
  try {
    return adQualityReportSchema.parse(await deps.adQuality.analyze(job.content));
  } catch {
    return null;
  }
}

/** Only from `draft`. The §5.1 rules block; the quality score never does (it is flagged and audited). */
export const publishJob = defineJobUseCase({
  name: 'publishJob',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'job:publish',
  audit: {
    action: 'job.published',
    target: (_input, result: PublishJobResult) => ({ type: 'job', id: result.job.id }),
    metadata: (_input, result: PublishJobResult) => ({
      qualityTotal: result.quality?.report.total ?? null,
      belowThreshold: result.quality?.belowThreshold ?? null,
      threshold: result.quality?.threshold ?? null,
    }),
  },
  handler: async ({ deps, actor, input }): Promise<PublishJobResult> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    if (job.status !== 'draft') throw new ConflictError('Only a draft can be published.');
    const issues = checkPublishable(job.content);
    if (issues.length > 0) throw issuesToValidationError(issues);
    const report = await tryAnalyze(deps, job);
    const now = deps.now();
    const saved = await deps.jobs.save({ ...job, status: 'published', quality: report, publishedAt: now, updatedAt: now });
    return { job: saved, quality: report ? assess(report, deps.adQualityThreshold) : null };
  },
});
