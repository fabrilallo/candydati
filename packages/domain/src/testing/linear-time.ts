/**
 * Guard against regular-expression denial of service (ReDoS) with an absolute time bound, not a growth ratio.
 *
 * Why not a ratio: timing a function on n and 8n and comparing puts linear code near 8, so ordinary runner noise
 * (coverage instrumentation, garbage collection, a loaded CI machine) pushes it over any sensible limit. Making a
 * ratio robust (CPU clocks, repetition, wider limit) only moved the noise around.
 *
 * Why an absolute bound works: on a hostile input of about 100 000 characters, linear code takes a few milliseconds,
 * even under coverage on a loaded runner. A quadratic or backtracking implementation takes n² = 1e10 steps, which is
 * many seconds (or never ends). The budget sits between the two with a wide margin on both sides, so noise cannot
 * fail linear code and a real regression cannot slip under it.
 */

/** Hostile inputs are about this many characters: n² is about 1e10 character steps for a quadratic implementation. */
export const HOSTILE_SIZE = 100_000;
/** Generous for linear code (milliseconds), far below what a quadratic implementation needs (seconds or more). */
export const LINEAR_BUDGET_MS = 1500;
/** The warm-up input is this many times smaller than the hostile one: enough to compile the code paths. */
const WARM_UP_DIVISOR = 50;

export interface HostileInputOptions {
  /** The number `run` scales its input by (characters, or repetitions of a short unit). Default `HOSTILE_SIZE`. */
  readonly size?: number;
  /** Time allowed for the one run on the large input, in milliseconds. Default `LINEAR_BUDGET_MS`. */
  readonly budgetMs?: number;
}

/** `unit` repeated until the text is at least `length` characters long, so shapes are compared by total length. */
export function hostileText(unit: string, length: number = HOSTILE_SIZE): string {
  return unit.repeat(Math.ceil(length / Math.max(unit.length, 1)));
}

/**
 * Runs `run(size)` once on a small input (warm-up) and once on the large one, and fails when the large run exceeds
 * the budget. `run` builds its hostile input from `size` and calls the function under test.
 */
export function expectLinearOnHostileInput(run: (size: number) => void, options: HostileInputOptions = {}): void {
  const size = options.size ?? HOSTILE_SIZE;
  const budgetMs = options.budgetMs ?? LINEAR_BUDGET_MS;
  run(Math.max(Math.floor(size / WARM_UP_DIVISOR), 1));
  const started = performance.now();
  run(size);
  const elapsedMs = performance.now() - started;
  if (elapsedMs >= budgetMs) {
    throw new Error(
      `not linear: hostile input of size ${size} took ${elapsedMs.toFixed(0)} ms, budget ${budgetMs} ms (linear code needs a few ms)`,
    );
  }
}
