/** Aggregation of repeated eval runs: a case counts by its pass rate over N runs, never by one lucky run. */

export interface RunOutcome {
  readonly caseId: string;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

export interface CaseSummary {
  readonly caseId: string;
  readonly runs: number;
  readonly passes: number;
  /** passes / runs, 0..1. */
  readonly passRate: number;
  /** Variance of the pass/fail outcome (Bernoulli, p(1-p)): 0 when every run agrees, 0.25 at its most unstable. */
  readonly variance: number;
  /** Some runs passed and some failed: the assistant is not reliable on this case. */
  readonly flaky: boolean;
  /** Distinct failure messages with the number of runs they appeared in, most frequent first. */
  readonly failureCounts: readonly (readonly [string, number])[];
}

export interface OverallSummary {
  readonly cases: number;
  readonly runs: number;
  readonly passes: number;
  /** Pooled: passes / runs over every run of every case. */
  readonly passRate: number;
  /** Cases that passed in every run. */
  readonly stablePasses: number;
  readonly flakyCases: number;
  /** Mean of the per-case pass rates (each case weighs the same). */
  readonly meanCasePassRate: number;
  /** Variance of the per-case pass rates around their mean. */
  readonly passRateVariance: number;
}

const ratio = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole);

export function summarizeCase(caseId: string, outcomes: readonly RunOutcome[]): CaseSummary {
  const runs = outcomes.length;
  const passes = outcomes.filter((o) => o.passed).length;
  const passRate = ratio(passes, runs);
  const counts = new Map<string, number>();
  for (const failure of outcomes.flatMap((o) => o.failures)) counts.set(failure, (counts.get(failure) ?? 0) + 1);
  return {
    caseId,
    runs,
    passes,
    passRate,
    variance: passRate * (1 - passRate),
    flaky: passes > 0 && passes < runs,
    failureCounts: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}

/** One summary per case, in the order the cases first appear. */
export function summarizeCases(outcomes: readonly RunOutcome[]): readonly CaseSummary[] {
  const byCase = new Map<string, RunOutcome[]>();
  for (const outcome of outcomes) byCase.set(outcome.caseId, [...(byCase.get(outcome.caseId) ?? []), outcome]);
  return [...byCase.entries()].map(([caseId, list]) => summarizeCase(caseId, list));
}

export function summarizeOverall(cases: readonly CaseSummary[]): OverallSummary {
  const runs = cases.reduce((sum, c) => sum + c.runs, 0);
  const passes = cases.reduce((sum, c) => sum + c.passes, 0);
  const mean = ratio(
    cases.reduce((sum, c) => sum + c.passRate, 0),
    cases.length,
  );
  return {
    cases: cases.length,
    runs,
    passes,
    passRate: ratio(passes, runs),
    stablePasses: cases.filter((c) => c.runs > 0 && c.passes === c.runs).length,
    flakyCases: cases.filter((c) => c.flaky).length,
    meanCasePassRate: mean,
    passRateVariance: ratio(
      cases.reduce((sum, c) => sum + (c.passRate - mean) ** 2, 0),
      cases.length,
    ),
  };
}

/** Cases whose pass rate is under `minRate` (default 1: every run must pass). */
export const failingCases = (cases: readonly CaseSummary[], minRate: number): readonly CaseSummary[] => cases.filter((c) => c.passRate < minRate);
