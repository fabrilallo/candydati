import {
  QUALITY_CATEGORIES,
  totalOf,
  type AdQualityAnalyzer,
  type AdQualityReport,
  type JobContent,
  type QualityCategory,
  type VaguePhrase,
} from '@tt/domain';
import { z } from 'zod';
import { annotate, occursInAd, type AnnotatedFragment } from './detect.js';
import type { StructuredGenerator } from './generator.js';
import { buildQualityPrompt } from './prompt.js';
import { STRUCTURAL_CATEGORIES, evaluate, improvementsOf, scoresOf, type Evaluation } from './rules/evaluate.js';

const MAX_PHRASES = 30;
const MAX_IMPROVEMENTS = 20;
const MAX_SUGGESTION = 600;
const MAX_IMPROVEMENT = 400;

const rawScore = z.number().finite();
const categoryEnum = z.enum(QUALITY_CATEGORIES);

/** What the model must return. Lenient on ranges: values are clamped locally. */
export const modelOutputSchema = z.object({
  scores: z.object({
    role_requirements: rawScore,
    benefits: rawScore,
    growth: rawScore,
    work_life_balance: rawScore,
    responsibilities_clarity: rawScore,
    culture: rawScore,
    technologies: rawScore,
    selection_process: rawScore.optional(),
    work_mode: rawScore.optional(),
    salary_transparency: rawScore.optional(),
  }),
  vaguePhrases: z.array(z.object({ text: z.string(), category: categoryEnum, suggestion: z.string() })).default([]),
  improvements: z.array(z.string()).default([]),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;

/** Clamps to 0..1 and rounds to the nearest 0.5, the grid of the rubric. */
export const normalizeScore = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 2) / 2;

const isStructural = (category: QualityCategory): boolean => (STRUCTURAL_CATEGORIES as readonly string[]).includes(category);

function mergeScores(output: ModelOutput, evaluation: Evaluation): AdQualityReport['scores'] {
  const rules = scoresOf(evaluation);
  return Object.fromEntries(
    QUALITY_CATEGORIES.map((category) => [category, isStructural(category) ? rules[category] : normalizeScore(output.scores[category as keyof ModelOutput['scores']] ?? 0)]),
  ) as AdQualityReport['scores'];
}

function groundedPhrases(output: ModelOutput, annotated: readonly AnnotatedFragment[]): readonly VaguePhrase[] {
  const seen = new Set<string>();
  return output.vaguePhrases
    .filter((phrase) => occursInAd(phrase.text, annotated) && phrase.text.length <= 300 && phrase.suggestion.trim().length > 0)
    .filter((phrase) => !seen.has(phrase.text) && !!seen.add(phrase.text))
    .map((phrase) => ({ ...phrase, suggestion: phrase.suggestion.trim().slice(0, MAX_SUGGESTION) }))
    .slice(0, MAX_PHRASES);
}

/** Validates the raw answer and builds the report. Throws when the answer does not match the schema. */
export function reportFromModel(raw: unknown, content: JobContent): AdQualityReport {
  const output = modelOutputSchema.parse(raw);
  const annotated = annotate(content);
  const evaluation = evaluate(content, annotated);
  const scores = mergeScores(output, evaluation);
  const structuralOnly: Partial<Evaluation> = Object.fromEntries(STRUCTURAL_CATEGORIES.map((category) => [category, evaluation[category]]));
  const modelLines = output.improvements.map((line) => line.trim().slice(0, MAX_IMPROVEMENT)).filter((line) => line.length > 0);
  return {
    scores,
    total: totalOf(scores),
    vaguePhrases: [...groundedPhrases(output, annotated)],
    improvements: [...improvementsOf(structuralOnly, content.language), ...modelLines].slice(0, MAX_IMPROVEMENTS),
    source: 'model',
  };
}

/** Scores the free text with a model. Rejects when the model fails or answers with an invalid shape. */
export function createModelAnalyzer(generate: StructuredGenerator): AdQualityAnalyzer {
  return {
    async analyze(content) {
      const { system, prompt } = buildQualityPrompt(content);
      const raw = await generate({ system, prompt, schema: modelOutputSchema });
      return reportFromModel(raw, content);
    },
  };
}
