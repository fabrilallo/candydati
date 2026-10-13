export type Score = 0 | 0.5 | 1;

/** Why a category is below 1; selects the improvement line. */
export type Issue = 'missing' | 'partial' | 'wide' | 'invalid' | 'vague';

export interface CategoryResult {
  readonly score: Score;
  readonly issue: Issue | null;
}

export const result = (score: Score, issue?: Exclude<Issue, 'missing'>): CategoryResult => {
  if (score === 1) return { score, issue: null };
  return { score, issue: score === 0 ? 'missing' : (issue ?? 'partial') };
};
