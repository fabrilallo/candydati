import { createModelAnalyzer } from '@candydati/ad-quality';
import { adQualityReportSchema, type AdQualityReport } from '@candydati/domain';
import type { DemoJobSpec } from '../content/types.js';
import { demoJobContent } from './jobs.js';

/**
 * The quality report of each published ad, as the product stores it at publication: the recorded model answer is
 * replayed through the real analyzer, so the deterministic rules, the grounding of vague phrases and the merge are the
 * product's own. Scores the ad, never a candidate (PRODUCT.md §4.3). The product shows it while a model is configured.
 */
export async function precomputedQualities(specs: readonly DemoJobSpec[]): Promise<ReadonlyMap<string, AdQualityReport>> {
  const entries = await Promise.all(
    specs
      .filter((spec) => spec.status !== 'draft' && spec.quality !== null)
      .map(async (spec) => {
        const analyzer = createModelAnalyzer(async () => spec.quality);
        const report = adQualityReportSchema.parse(await analyzer.analyze(demoJobContent(spec)));
        return [spec.key, report] as const;
      }),
  );
  return new Map(entries);
}
