/**
 * A transaction owns ONE connection and a connection runs one query at a time. `Promise.all` over repository calls starts
 * them together, so pg queues the later ones and warns that this stops working in pg@9. Use these instead: same results,
 * same order, but each step starts when the previous one is done.
 */

type Step = () => PromiseLike<unknown>;

/** The results of `steps`, in order, run one after the other. */
export async function sequential<const T extends readonly Step[]>(...steps: T): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = [];
  for (const step of steps) results.push(await step());
  return results as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}

/** `items.map(work)` with one call at a time. */
export async function mapSequential<T, R>(items: readonly T[], work: (item: T) => PromiseLike<R>): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) results.push(await work(item));
  return results;
}
