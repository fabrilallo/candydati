import { createAdQualityAnalyzer } from '@tt/ad-quality';
import type { AdQualityAnalyzer } from '@tt/domain';
import type { FastifyBaseLogger } from 'fastify';
import { createMastraGenerator } from '@tt/providers';

/** Rules only without FAST_MODEL; with it, the model first and the rules as fallback. Logs never carry ad text or keys. */
export function createConfiguredAnalyzer(fastModel: string | undefined, log: Pick<FastifyBaseLogger, 'warn'>): AdQualityAnalyzer {
  if (!fastModel) return createAdQualityAnalyzer({});
  return createAdQualityAnalyzer({
    generate: createMastraGenerator(fastModel),
    onModelError: (error) => log.warn({ reason: error instanceof Error ? error.message : 'unknown' }, 'ad quality model failed, using rules'),
  });
}
