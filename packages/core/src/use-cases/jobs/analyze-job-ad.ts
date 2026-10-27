import { assess, checkPublishable, complianceWarnings, jobContentSchema, type AdQualityAssessment, type PublishIssue } from '@candydati/domain';
import { z } from 'zod';
import { defineJobUseCase } from './define.js';

export interface AnalyzeJobAdResult {
  /** `unavailable` while no language model is configured: then there is no score at all (PRODUCT.md §4.3). */
  readonly status: 'assessed' | 'unavailable';
  /** Null exactly when `status` is `unavailable`. */
  readonly assessment: AdQualityAssessment | null;
  readonly publishIssues: readonly PublishIssue[];
  /** Doubtful compliance findings (never blocking), with the offending text and a suggested fix. */
  readonly complianceWarnings: ReturnType<typeof complianceWarnings>;
}

/**
 * Live feedback while editing. No state change, so no audit; an analyzer failure propagates to the caller. Without a
 * model the publication and compliance rules are still checked: they are not the score.
 */
export const analyzeJobAd = defineJobUseCase({
  name: 'analyzeJobAd',
  input: z.object({ content: jobContentSchema }),
  permission: 'job:update',
  audit: { skip: 'no state change; analysis of unsaved content' },
  handler: async ({ deps, input }): Promise<AnalyzeJobAdResult> => {
    const rules = { publishIssues: checkPublishable(input.content), complianceWarnings: complianceWarnings(input.content) };
    if (!deps.adQuality.available()) return { status: 'unavailable', assessment: null, ...rules };
    return { status: 'assessed', assessment: assess(await deps.adQuality.analyze(input.content), deps.adQualityThreshold), ...rules };
  },
});
