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

/** A baseline this long is well above timer noise and a garbage collection pause on a slow CI runner. */
const STEADY_MS = 20;
/** The baseline input grows at most 2^4 = 16× to reach STEADY_MS. */
const MAX_DOUBLINGS = 4;
const RUNS = 5;

/**
 * How much slower `run` gets when the input grows 4×: about 4 for linear code, about 16 for a quadratic regex.
 * Independent of the machine's speed, unlike a fixed time limit. The baseline size doubles until one run takes
 * STEADY_MS, so the ratio compares two real timings rather than a large run against the noise floor.
 */
export function growthRatio(run: (size: number) => void, size: number): number {
  run(size); // warm-up
  let base = size;
  let small = bestOf(RUNS, () => run(base));
  for (let doubling = 0; small < STEADY_MS && doubling < MAX_DOUBLINGS; doubling += 1) {
    base *= 2;
    small = bestOf(RUNS, () => run(base));
  }
  const large = bestOf(RUNS, () => run(base * 4));
  return large / Math.max(small, FLOOR_MS);
}

/** Linear enough: quadratic code gives about 16. */
export const LINEAR_GROWTH_MAX = 6;
