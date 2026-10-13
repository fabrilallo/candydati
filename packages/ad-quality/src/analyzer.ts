import type { AdQualityAnalyzer } from '@tt/domain';
import type { StructuredGenerator } from './generator.js';
import { createModelAnalyzer } from './model-analyzer.js';
import { createRulesAnalyzer } from './rules-analyzer.js';

export interface AdQualityAnalyzerOptions {
  /** Without it the analysis is rules only. */
  readonly generate?: StructuredGenerator;
  /** Called with the cause every time the model path fails and the rules answer instead. */
  readonly onModelError?: (error: unknown) => void;
}

/** Model when configured, rules otherwise or when the model fails. Never throws for a valid content. */
export function createAdQualityAnalyzer(options: AdQualityAnalyzerOptions = {}): AdQualityAnalyzer {
  const rules = createRulesAnalyzer();
  const { generate, onModelError } = options;
  if (generate === undefined) return rules;
  const model = createModelAnalyzer(generate);
  return {
    async analyze(content) {
      try {
        return await model.analyze(content);
      } catch (error) {
        reportError(onModelError, error);
        return rules.analyze(content);
      }
    },
  };
}

/** A faulty error handler must not turn a recoverable model failure into a thrown analysis. */
function reportError(handler: ((error: unknown) => void) | undefined, error: unknown): void {
  try {
    handler?.(error);
  } catch {
    // The rules report is returned either way; the handler's own failure has nowhere better to go.
  }
}
