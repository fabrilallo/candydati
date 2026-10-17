/** Smallest time worth comparing: below it, timer noise dominates. */
const FLOOR_MS = 5;

const bestOf = (runs: number, task: () => void): number => {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    task();
    best = Math.min(best, performance.now() - started);
  }
  return best;
};

const RUNS = 5;
/** How much bigger the second input is: wide enough that runner noise cannot pass linear code for quadratic. */
const GROWTH = 8;

/**
 * How much slower `run` gets when the input grows 8×: about 8 for linear code, about 64 for a quadratic regex.
 * Independent of the machine's speed, unlike a fixed time limit; the wide gap between the two keeps a noisy CI runner
 * (coverage, garbage collection) from failing linear code while quadratic code stays far above the limit.
 */
export function growthRatio(run: (size: number) => void, size: number): number {
  run(size); // warm-up
  const small = bestOf(RUNS, () => run(size));
  const large = bestOf(RUNS, () => run(size * GROWTH));
  return large / Math.max(small, FLOOR_MS);
}

/** Linear enough: linear code gives about 8, quadratic code about 64. */
export const LINEAR_GROWTH_MAX = 16;
