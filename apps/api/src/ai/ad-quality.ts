import { createAdQualityAnalyzer } from '@candydati/ad-quality';
import type { AdQualityAnalyzer } from '@candydati/domain';
import type { FastifyBaseLogger } from 'fastify';
import { createMastraGenerator, type AiModelRef } from '@candydati/providers';

type Log = Pick<FastifyBaseLogger, 'warn'>;

const withModel = (model: AiModelRef, log: Log): AdQualityAnalyzer =>
  createAdQualityAnalyzer({
    generate: createMastraGenerator(model),
    onModelError: (error) => log.warn({ reason: error instanceof Error ? error.message : 'unknown' }, 'ad quality model failed, using rules'),
  });

/**
 * The analyzer that follows the fast model in force at each call (switched on, off or changed from the app without a
 * restart); one analyzer per distinct model. Without a fast model there is no score at all (PRODUCT.md §4.3):
 * `available()` is false and `analyze` rejects rather than scoring with the rules alone. Logs never carry ad text or keys.
 */
export function createLiveAnalyzer(fastModel: () => AiModelRef | null, log: Log): AdQualityAnalyzer {
  let built: { readonly key: string; readonly analyzer: AdQualityAnalyzer } | null = null;
  const current = (model: AiModelRef): AdQualityAnalyzer => {
    const key = JSON.stringify(model);
    if (built?.key !== key) built = { key, analyzer: withModel(model, log) };
    return built.analyzer;
  };
  return {
    available: () => fastModel() !== null,
    analyze: (input) => {
      const model = fastModel();
      if (model === null) return Promise.reject(new Error('no fast model is configured: there is no ad score'));
      return current(model).analyze(input);
    },
  };
}
