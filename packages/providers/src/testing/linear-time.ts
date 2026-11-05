/**
 * Linear-time checks for code that runs on text written by strangers (regular expressions above all).
 *
 * `growthRatio` times the same work on an input and on one GROWTH times bigger: linear code is about GROWTH times
 * slower, quadratic code about GROWTH² times. With GROWTH = 16 that is 16 against 256, and the limit sits at their
 * geometric mean, 64: four times above a linear result (room for a noisy CI runner, coverage instrumentation, a
 * garbage collection) and four times below a quadratic one. The previous limit was 16 for a growth of 8 (linear 8,
 * quadratic 64): a margin of only two on the linear side, which a GitHub runner under coverage exceeded (16.45).
 *
 * Time is the CPU time of the thread, not wall time: on a loaded machine (a CI runner, parallel test workers) wall
 * time also counts the moments the process waits for a CPU, more often during the longer, large run. Noise that is
 * left (cache, garbage collection) only ever adds time, so each size is timed several times, interleaved (a slow phase of the machine hits both
 * sizes alike), and the minimum is kept, which also drops a cold first run. The input is first grown until it takes
 * long enough to time: below half a millisecond fixed costs and timer noise dominate. A floor on the small time instead
 * would hide a fast quadratic, its ratio divided by the floor and not by its real time: the old 5 ms floor passed a
 * quadratic whose small input took a few microseconds with a ratio of 0.13 (see linear-time.test.ts).
 */

/** Below this, timer noise and fixed costs (a call, an allocation) dominate a measurement of CPU time. */
const MIN_SAMPLE_MS = 0.5;
/**
 * At most 2^3 = 8 times the size asked for: quadratic work grows 64 times over those doublings, so it reaches a
 * measurable time, while linear work stays small enough (in cache, light on the garbage collector) not to look
 * superlinear because of memory alone, which inputs of megabytes do.
 */
const MAX_DOUBLINGS = 3;
const RUNS = 5;
/** How much bigger the second input is: wide enough that runner noise cannot pass linear code for quadratic. */
const GROWTH = 16;

/** CPU time of this thread in ms: unlike wall time, it does not grow when other processes take the CPU. */
const threadCpuMs = (): number => {
  const { user, system } = process.threadCpuUsage();
  return (user + system) / 1000;
};

const timed = (task: () => void): number => {
  const started = threadCpuMs();
  task();
  return threadCpuMs() - started;
};

/** The size asked for, doubled until one run takes MIN_SAMPLE_MS (at most MAX_DOUBLINGS times). */
const calibrate = (run: (size: number) => void, size: number): number => {
  let current = size;
  for (let doubling = 0; doubling < MAX_DOUBLINGS && timed(() => run(current)) < MIN_SAMPLE_MS; doubling += 1) current *= 2;
  return current;
};

/**
 * How much slower `run` gets when the input grows GROWTH times: about 16 for linear code, about 256 for quadratic
 * code. Independent of the machine's speed, unlike a fixed time limit.
 */
export function growthRatio(run: (size: number) => void, size: number): number {
  const small = calibrate(run, size);
  const large = small * GROWTH;
  let smallBest = Number.POSITIVE_INFINITY;
  let largeBest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < RUNS; i += 1) {
    smallBest = Math.min(smallBest, timed(() => run(small)));
    largeBest = Math.min(largeBest, timed(() => run(large)));
  }
  return largeBest / Math.max(smallBest, Number.EPSILON);
}

/** Linear enough: the geometric mean of linear (16) and quadratic (256) growth, four times from each. */
export const LINEAR_GROWTH_MAX = 64;

/**
 * Time budget for a test that runs several `growthRatio` checks: CPU time is measured, but on a loaded runner the
 * wall time of the same work can be several times longer than the default 5 s test timeout.
 */
export const LINEAR_TIME_TEST_TIMEOUT_MS = 30_000;
