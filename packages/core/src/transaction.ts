import type { TaskQueue } from './intake-ports.js';

/**
 * Root repository → the same repository bound to the open transaction. Rebinding is by identity: only repositories the
 * transaction itself built (the composition root) move into it; anything else a caller passed stays as it is.
 */
export type TransactionalRepositories = ReadonlyMap<unknown, unknown>;

/**
 * The unit of work. `run` opens ONE database transaction, hands `work` the repositories bound to it, commits when `work`
 * resolves and rolls everything back when it throws. Postgres: `db.transaction`; tests: an in-memory journal.
 */
export interface TransactionPort {
  run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T>;
  /** Receives the error of an after-commit effect: the commit stands, so the error is reported, never thrown. */
  readonly onEffectError?: ((error: unknown) => void) | undefined;
}

/** Registers a side effect outside the database (queue, storage, email) to run once the transaction has committed. */
export type AfterCommit = (effect: () => Promise<void>) => void;

/** What every dependency object that can open a unit of work carries. */
export interface TransactionalDeps {
  readonly transaction: TransactionPort;
  /** Present only inside a transaction: effects registered here run after the commit, never after a rollback. */
  readonly afterCommit?: AfterCommit | undefined;
}

const BASE = Symbol('transaction.base');

type Bound<D> = D & { readonly [BASE]?: D };

/** The dependencies outside any transaction: what an after-commit effect must use (the transaction is gone by then). */
export const baseDeps = <D extends object>(deps: D): D => (deps as Bound<D>)[BASE] ?? deps;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

const swap = (repositories: TransactionalRepositories, value: unknown): unknown => (repositories.has(value) ? repositories.get(value) : value);

/** `target` with its repositories swapped; an object holding none of them is returned as it is. */
const rebind = <T extends Readonly<Record<string, unknown>>>(target: T, repositories: TransactionalRepositories): T =>
  Object.values(target).some((value) => repositories.has(value))
    ? (Object.fromEntries(Object.entries(target).map(([key, value]) => [key, swap(repositories, value)])) as T)
    : target;

/** A queue whose tasks are sent after the commit: a worker never sees a task whose rows are not committed yet. */
const deferredQueue = (queue: TaskQueue, afterCommit: AfterCommit): TaskQueue => ({
  async enqueue(name, payload, options) {
    afterCommit(() => queue.enqueue(name, payload, options));
  },
});

/**
 * `deps` with every repository (top level and one nested object deep, e.g. `feedback` or `mail`) bound to the
 * transaction, the queue deferred to after the commit, and `afterCommit` to register other effects.
 */
function bindDeps<D extends TransactionalDeps>(deps: D, repositories: TransactionalRepositories, afterCommit: AfterCommit): D {
  const nested = Object.fromEntries(
    Object.entries(deps).map(([key, value]: [string, unknown]) => {
      if (repositories.has(value)) return [key, repositories.get(value)];
      return [key, isPlainObject(value) && key !== 'transaction' ? rebind(value, repositories) : value];
    }),
  );
  const queue = (deps as { readonly queue?: TaskQueue }).queue;
  return {
    ...nested,
    ...(queue ? { queue: deferredQueue(queue, afterCommit) } : {}),
    afterCommit,
    [BASE]: deps,
  } as unknown as D;
}

async function runEffects(effects: readonly (() => Promise<void>)[], onError: ((error: unknown) => void) | undefined): Promise<void> {
  for (const effect of effects) {
    try {
      await effect();
    } catch (error) {
      onError?.(error);
    }
  }
}

/**
 * Runs `work` in one transaction with `deps` bound to it, then the after-commit effects in order. Inside an open
 * transaction (`deps.afterCommit` set) it joins it: nested use cases commit or roll back with their caller.
 */
export async function inTransaction<D extends TransactionalDeps, T>(deps: D, work: (deps: D) => Promise<T>): Promise<T> {
  if (deps.afterCommit) return work(deps);
  const effects: (() => Promise<void>)[] = [];
  const afterCommit: AfterCommit = (effect) => {
    effects.push(effect);
  };
  const result = await deps.transaction.run((repositories) => work(bindDeps(deps, repositories, afterCommit)));
  await runEffects(effects, deps.transaction.onEffectError);
  return result;
}

/** Runs `effect` after the commit inside a transaction, or right away outside one. */
export async function afterCommitOrNow(deps: Partial<TransactionalDeps>, effect: () => Promise<void>): Promise<void> {
  if (deps.afterCommit) deps.afterCommit(effect);
  else await effect();
}
