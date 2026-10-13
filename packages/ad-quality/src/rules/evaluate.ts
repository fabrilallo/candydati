import { QUALITY_CATEGORIES, type JobContent, type Locale, type QualityCategory } from '@tt/domain';
import type { AnnotatedFragment } from '../detect.js';
import { IMPROVEMENT_MESSAGES } from './messages.js';
import type { CategoryResult } from './result.js';
import { scoreSalary, scoreSelectionProcess, scoreWorkMode } from './structural.js';
import {
  scoreBalance,
  scoreBenefits,
  scoreCulture,
  scoreGrowth,
  scoreRequirements,
  scoreResponsibilities,
  scoreTechnologies,
} from './textual.js';

export type Evaluation = Record<QualityCategory, CategoryResult>;

/** Categories the rules decide exactly from the structure of the ad; the model never overrides them. */
export const STRUCTURAL_CATEGORIES = ['selection_process', 'work_mode', 'salary_transparency'] as const satisfies readonly QualityCategory[];

/** Tie-break when two categories lose the same amount: the ones candidates miss most come first. */
const IMPACT_ORDER: readonly QualityCategory[] = [
  'salary_transparency',
  'selection_process',
  'work_mode',
  'responsibilities_clarity',
  'role_requirements',
  'benefits',
  'growth',
  'work_life_balance',
  'culture',
  'technologies',
];

export const evaluate = (content: JobContent, annotated: readonly AnnotatedFragment[]): Evaluation => ({
  selection_process: scoreSelectionProcess(content),
  role_requirements: scoreRequirements(annotated),
  work_mode: scoreWorkMode(content),
  salary_transparency: scoreSalary(content),
  benefits: scoreBenefits(annotated),
  growth: scoreGrowth(annotated),
  work_life_balance: scoreBalance(annotated),
  responsibilities_clarity: scoreResponsibilities(annotated),
  culture: scoreCulture(annotated),
  technologies: scoreTechnologies(annotated),
});

export const scoresOf = (evaluation: Evaluation): Record<QualityCategory, number> =>
  Object.fromEntries(QUALITY_CATEGORIES.map((category) => [category, evaluation[category].score])) as Record<QualityCategory, number>;

/** One line per category below 1, most impactful first. */
export function improvementsOf(
  evaluation: Partial<Evaluation>,
  language: Locale,
): readonly string[] {
  return IMPACT_ORDER.flatMap((category) => {
    const found = evaluation[category];
    if (found === undefined || found.issue === null) return [];
    const lines = IMPROVEMENT_MESSAGES[language][category];
    return [{ category, loss: 1 - found.score, line: lines[found.issue] ?? lines.partial }];
  })
    .sort((a, b) => b.loss - a.loss)
    .map(({ line }) => line);
}
