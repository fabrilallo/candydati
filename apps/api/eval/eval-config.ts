import { z } from 'zod';

export const DEFAULT_RUNS = 3;
export const MAX_RUNS = 20;

export interface EvalConfig {
  /** Times each case runs. */
  readonly runs: number;
  /** A case fails the evaluation when its pass rate is under this (default 1: every run must pass). */
  readonly minPassRate: number;
  /** Only these cases (empty: all). A partial run never overwrites the committed report. */
  readonly caseIds: readonly string[];
  /** Where to write the report instead of the committed one. */
  readonly reportPath: string | null;
}

const settingsSchema = z.object({
  runs: z.coerce.number().int().min(1).max(MAX_RUNS),
  minPassRate: z.coerce.number().min(0).max(1),
});

const empty = (value: string | undefined): string | undefined => (value && value.trim() !== '' ? value.trim() : undefined);

/** `--runs=N` beats `EVAL_RUNS`; `EVAL_MIN_PASS_RATE` and `EVAL_REPORT_PATH` come from the environment. Other arguments are case ids. */
export function parseEvalConfig(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): EvalConfig {
  const flag = argv.find((a) => a.startsWith('--runs='));
  const settings = settingsSchema.parse({
    runs: flag ? flag.slice('--runs='.length) : (empty(env.EVAL_RUNS) ?? DEFAULT_RUNS),
    minPassRate: empty(env.EVAL_MIN_PASS_RATE) ?? 1,
  });
  return { ...settings, caseIds: argv.filter((a) => !a.startsWith('--')), reportPath: empty(env.EVAL_REPORT_PATH) ?? null };
}
