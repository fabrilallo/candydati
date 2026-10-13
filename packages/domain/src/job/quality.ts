import { z } from 'zod';
import type { JobContent } from './content.js';

/** The ten categories of the FuffAnnuncio business analysis (PRODUCT.md §4.3). Each is scored from 0 to 1. */
export const QUALITY_CATEGORIES = [
  'selection_process',
  'role_requirements',
  'work_mode',
  'salary_transparency',
  'benefits',
  'growth',
  'work_life_balance',
  'responsibilities_clarity',
  'culture',
  'technologies',
] as const;
export type QualityCategory = (typeof QUALITY_CATEGORIES)[number];

export const QUALITY_MAX_TOTAL = QUALITY_CATEGORIES.length;
/** 3 out of 5, the bar TechCompenso uses on its job board, on the 0-10 scale. Overridable per instance. */
export const DEFAULT_AD_QUALITY_THRESHOLD = 6;

const score = z.number().min(0).max(1);

export const vaguePhraseSchema = z.object({
  /** The phrase exactly as written in the ad. */
  text: z.string().min(1).max(300),
  category: z.enum(QUALITY_CATEGORIES),
  /** A concrete rewrite, in the language of the ad. Never invents facts: it asks for the missing one. */
  suggestion: z.string().min(1).max(600),
});
export type VaguePhrase = z.infer<typeof vaguePhraseSchema>;

export const adQualityReportSchema = z.object({
  scores: z.object(Object.fromEntries(QUALITY_CATEGORIES.map((category) => [category, score])) as Record<QualityCategory, typeof score>),
  /** Sum of the ten scores, 0-10, one decimal. */
  total: z.number().min(0).max(QUALITY_MAX_TOTAL),
  vaguePhrases: z.array(vaguePhraseSchema).max(30),
  /** What to add or clarify to raise the score, most useful first. */
  improvements: z.array(z.string().min(1).max(400)).max(20),
  /** `rules`: deterministic analysis, no model. `model`: a language model scored the free text. */
  source: z.enum(['rules', 'model']),
});
export type AdQualityReport = z.infer<typeof adQualityReportSchema>;

export const totalOf = (scores: AdQualityReport['scores']): number =>
  Math.round(QUALITY_CATEGORIES.reduce((sum, category) => sum + scores[category], 0) * 10) / 10;

/** Below the threshold the ad is flagged, never blocked (PRODUCT.md §4.3). */
export const isBelowQualityThreshold = (report: AdQualityReport, threshold: number): boolean => report.total < threshold;

/** Scores the ad, never the candidates. */
export interface AdQualityAssessment {
  readonly report: AdQualityReport;
  readonly threshold: number;
  readonly belowThreshold: boolean;
}

export const assess = (report: AdQualityReport, threshold: number): AdQualityAssessment => ({
  report,
  threshold,
  belowThreshold: isBelowQualityThreshold(report, threshold),
});

/** Implemented by `@tt/ad-quality`; `@tt/core` depends only on this port. Must never throw for a valid content. */
export interface AdQualityAnalyzer {
  analyze(content: JobContent): Promise<AdQualityReport>;
}
