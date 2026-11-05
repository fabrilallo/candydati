/**
 * Linear-time checks for code that runs on text written by strangers (regular expressions above all).
 *
 * `growthRatio` times the same work on an input and on one GROWTH times bigger: linear code is about GROWTH times
 * slower, quadratic code about GROWTH² times. With GROWTH = 16 that is 16 against 256, and the limit sits at their
 * geometric mean, 64: four times above a linear result (room for a noisy CI runner, coverage instrumentation, a
 * garbage collection) and four times below a quadratic one. The previous limit was 16 for a growth of 8 (linear 8,
 * quadratic 64): a margin of only two on the linear side, which a GitHub runner under coverage exceeded (16.45).
 *
 * The clock is the thread's CPU time where it is fine-grained (macOS): wall time also counts the moments the process
 * waits for a CPU, more often during the longer, large run. On Linux `process.threadCpuUsage` moves in scheduler ticks
 * (milliseconds), so short runs read 0: there the clock is wall time (`performance.now`, microseconds) instead.
 * Whatever the clock, a measurement is never divided by a time near its resolution: the work is repeated until one
 * sample lasts RESOLUTION_FACTOR times the clock's step, the large size is repeated as many times, and a clock that
 * does not move is an error, not a ratio of 10^16. The code is warmed up before calibrating, and if it still got faster
 * afterwards (JIT) and a small sample comes out short, the measurement is redone with more repetitions.
 *
 * Noise that is left (another process, cache, garbage collection) only ever adds time, so each size is sampled several
 * times, interleaved (a slow phase of the machine hits both sizes alike), and the minimum is kept. A fast input is
 * first grown (at most 8 times) so a quadratic shows: a floor on the small time would hide it instead, its ratio
 * divided by the floor (the old 5 ms floor passed a quadratic whose small input took microseconds with 0.13).
 */

/** A monotonic time source in milliseconds. */
export interface Clock {
  readonly now: () => number;
}

export const THREAD_CPU_CLOCK: Clock = {
  now: () => {
    const { user, system } = process.threadCpuUsage();
    return (user + system) / 1000;
  },
};

export const WALL_CLOCK: Clock = { now: () => performance.now() };

/** How long the resolution probe may spin, in wall time, before calling a clock frozen. */
const RESOLUTION_PROBE_MS = 50;
const RESOLUTION_STEPS = 5;

/**
 * The largest of the first steps the clock moves by (Infinity when it does not move during the probe). The largest, not
 * the smallest: Linux CPU time moves in irregular steps (1.0, 1.2, then 0.2 ms), and the small ones are not its grain.
 */
export function clockResolution(clock: Clock): number {
  const deadline = performance.now() + RESOLUTION_PROBE_MS;
  let last = clock.now();
  let step = 0;
  let changes = 0;
  while (changes < RESOLUTION_STEPS && performance.now() < deadline) {
    const current = clock.now();
    if (current !== last) {
      step = Math.max(step, current - last);
      last = current;
      changes += 1;
    }
  }
  return changes === 0 ? Number.POSITIVE_INFINITY : step;
}

/** Thread CPU time when it is finer than this, wall time otherwise. */
const FINE_RESOLUTION_MS = 0.05;
let defaultClock: Clock | undefined;

/** The CPU clock where it is fine-grained, wall time where it moves in ticks; chosen once per process. */
function pickClock(): Clock {
  defaultClock ??= clockResolution(THREAD_CPU_CLOCK) <= FINE_RESOLUTION_MS ? THREAD_CPU_CLOCK : WALL_CLOCK;
  return defaultClock;
}

/** A sample lasts at least this, and at least RESOLUTION_FACTOR steps of the clock. */
const MIN_SAMPLE_MS = 0.5;
const RESOLUTION_FACTOR = 10;
/** At most 2^3 = 8 times the size asked for: a quadratic grows 64 times, linear inputs stay small (cache, GC). */
const MAX_INPUT_DOUBLINGS = 3;
/** At most 2^12 repetitions of a sample: beyond that the work is too fast to measure on this clock. */
const MAX_REPEAT_DOUBLINGS = 12;
const RUNS = 5;
/** How much bigger the second input is: wide enough that runner noise cannot pass linear code for quadratic. */
const GROWTH = 16;

const sample = (clock: Clock, run: (size: number) => void, size: number, repeats: number): number => {
  const started = clock.now();
  for (let i = 0; i < repeats; i += 1) run(size);
  return clock.now() - started;
};

/** Runs before calibrating, so the JIT has optimized the code: cold code is many times slower than warm code. */
const WARM_UP_RUNS = 3;
/** Times the measurement is redone with 4 times the repetitions when the small sample came out below the minimum. */
const MAX_REMEASURES = 3;

/** The input grown (at most 8 times) until one run fills a sample, then the repetitions that make it fill one. */
function calibrate(clock: Clock, run: (size: number) => void, size: number, minSample: number): readonly [number, number] {
  for (let i = 0; i < WARM_UP_RUNS; i += 1) run(size);
  let current = size;
  for (let i = 0; i < MAX_INPUT_DOUBLINGS && sample(clock, run, current, 1) < minSample; i += 1) current *= 2;
  let repeats = 1;
  for (let i = 0; i < MAX_REPEAT_DOUBLINGS && sample(clock, run, current, repeats) < minSample; i += 1) repeats *= 2;
  return [current, repeats];
}

/** The best small and large samples of RUNS interleaved pairs. */
function bestOf(clock: Clock, run: (size: number) => void, small: number, repeats: number): readonly [number, number] {
  let smallBest = Number.POSITIVE_INFINITY;
  let largeBest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < RUNS; i += 1) {
    smallBest = Math.min(smallBest, sample(clock, run, small, repeats));
    largeBest = Math.min(largeBest, sample(clock, run, small * GROWTH, repeats));
  }
  return [smallBest, largeBest];
}

/**
 * How much slower `run` gets when the input grows GROWTH times: about 16 for linear code, about 256 for quadratic
 * code. Independent of the machine's speed, unlike a fixed time limit. Throws when the clock cannot measure the work.
 */
export function growthRatio(run: (size: number) => void, size: number, clock: Clock = pickClock()): number {
  const resolution = clockResolution(clock);
  if (!Number.isFinite(resolution)) throw new Error('growthRatio: the clock does not move, nothing can be measured');
  const minSample = Math.max(MIN_SAMPLE_MS, RESOLUTION_FACTOR * resolution);
  const [small, calibrated] = calibrate(clock, run, size, minSample);
  let repeats = calibrated;
  let [smallBest, largeBest] = bestOf(clock, run, small, repeats);
  // The code may have got faster since calibration (JIT, caches): never divide by a sample shorter than intended.
  for (let i = 0; i < MAX_REMEASURES && smallBest < minSample; i += 1) {
    repeats *= 4;
    [smallBest, largeBest] = bestOf(clock, run, small, repeats);
  }
  if (smallBest <= resolution) {
    throw new Error(`growthRatio: ${repeats} runs took ${smallBest} ms, not above the clock resolution of ${resolution} ms`);
  }
  return largeBest / smallBest;
}

/** Linear enough: the geometric mean of linear (16) and quadratic (256) growth, four times from each. */
export const LINEAR_GROWTH_MAX = 64;

/**
 * Time budget for a test that runs several `growthRatio` checks: on a loaded runner the wall time of the same work can
 * be several times longer than the default 5 s test timeout.
 */
export const LINEAR_TIME_TEST_TIMEOUT_MS = 30_000;
