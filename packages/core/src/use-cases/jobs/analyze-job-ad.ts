import { assess, checkPublishable, complianceWarnings, jobContentSchema, type AdQualityAssessment, type PublishIssue } from '@tt/domain';
import { z } from 'zod';
import { defineJobUseCase } from './define.js';

export interface AnalyzeJobAdResult {
  readonly assessment: AdQualityAssessment;
  readonly publishIssues: readonly PublishIssue[];
  /** Doubtful compliance findings (never blocking), with the offending text and a suggested fix. */
  readonly complianceWarnings: ReturnType<typeof complianceWarnings>;
}

/** Live feedback while editing. No state change, so no audit; an analyzer failure propagates to the caller. */
export const analyzeJobAd = defineJobUseCase({
  name: 'analyzeJobAd',
  input: z.object({ content: jobContentSchema }),
  permission: 'job:update',
  audit: { skip: 'no state change; analysis of unsaved content' },
  handler: async ({ deps, input }): Promise<AnalyzeJobAdResult> => ({
    assessment: assess(await deps.adQuality.analyze(input.content), deps.adQualityThreshold),
    publishIssues: checkPublishable(input.content),
    complianceWarnings: complianceWarnings(input.content),
  }),
});
