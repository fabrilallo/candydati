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

/**
 * How much slower `run` gets when the input grows 4×: about 4 for linear code, about 16 for a quadratic regex.
 * Independent of the machine's speed, unlike a fixed time limit.
 */
export function growthRatio(run: (size: number) => void, size: number): number {
  run(size); // warm-up
  const small = bestOf(3, () => run(size));
  const large = bestOf(3, () => run(size * 4));
  return large / Math.max(small, FLOOR_MS);
}

/** Linear enough: quadratic code gives about 16. */
export const LINEAR_GROWTH_MAX = 6;
