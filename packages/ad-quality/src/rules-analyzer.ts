import { totalOf, type AdQualityAnalyzer, type AdQualityReport, type JobContent } from '@candydati/domain';
import { annotate, vaguePhrasesOf } from './detect.js';
import { fillerImprovementsOf, fillerPhrasesOf } from './filler.js';
import { evaluate, improvementsOf, scoresOf } from './rules/evaluate.js';

const MAX_PHRASES = 30;

/** Deterministic analysis: same ad, same report. No model, no network. */
export function analyzeWithRules(content: JobContent): AdQualityReport {
  const annotated = annotate(content);
  const evaluation = evaluate(content, annotated);
  const scores = scoresOf(evaluation);
  return {
    scores,
    total: totalOf(scores),
    vaguePhrases: [...fillerPhrasesOf(annotated, content.language), ...vaguePhrasesOf(annotated, content.language)].slice(0, MAX_PHRASES),
    improvements: [...fillerImprovementsOf(annotated, content.language), ...improvementsOf(evaluation, content.language)],
    source: 'rules',
  };
}

export const createRulesAnalyzer = (): AdQualityAnalyzer => ({
  analyze: (content) => Promise.resolve(analyzeWithRules(content)),
});
