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

/** Rules only without a fast model; with one, the model first and the rules as fallback. Logs never carry ad text or keys. */
export function createConfiguredAnalyzer(fastModel: string | undefined, log: Log): AdQualityAnalyzer {
  return fastModel ? withModel({ id: fastModel as `${string}/${string}` }, log) : createAdQualityAnalyzer({});
}

/**
 * The analyzer that follows the fast model in force at each call (switched on, off or changed from the app without a
 * restart); one analyzer per distinct model.
 */
export function createLiveAnalyzer(fastModel: () => AiModelRef | null, log: Log): AdQualityAnalyzer {
  const rules = createAdQualityAnalyzer({});
  let built: { readonly key: string; readonly analyzer: AdQualityAnalyzer } | null = null;
  const current = (): AdQualityAnalyzer => {
    const model = fastModel();
    if (model === null) return rules;
    const key = JSON.stringify(model);
    if (built?.key !== key) built = { key, analyzer: withModel(model, log) };
    return built.analyzer;
  };
  return { analyze: (input) => current().analyze(input) };
}
