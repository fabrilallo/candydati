import { totalOf, type AdQualityAnalyzer, type AdQualityReport, type JobContent } from '@candydati/domain';
import { annotate, vaguePhrasesOf } from './detect.js';
import { evaluate, improvementsOf, scoresOf } from './rules/evaluate.js';

/** Deterministic analysis: same ad, same report. No model, no network. */
export function analyzeWithRules(content: JobContent): AdQualityReport {
  const annotated = annotate(content);
  const evaluation = evaluate(content, annotated);
  const scores = scoresOf(evaluation);
  return {
    scores,
    total: totalOf(scores),
    vaguePhrases: [...vaguePhrasesOf(annotated, content.language)],
    improvements: [...improvementsOf(evaluation, content.language)],
    source: 'rules',
  };
}

export const createRulesAnalyzer = (): AdQualityAnalyzer => ({
  analyze: (content) => Promise.resolve(analyzeWithRules(content)),
});
