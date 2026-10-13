import { AsyncLocalStorage } from 'node:async_hooks';
import type { TransactionPort } from '../transaction.js';

/** Values a transaction changed, with what they held before its first change: the undo log. */
type Journal = Map<Cell<unknown>, unknown>;

const journals = new AsyncLocalStorage<Journal>();

/** One piece of in-memory state. Writes made inside an in-memory transaction are journaled so a rollback restores them. */
export interface Cell<T> {
  get(): T;
  set(next: T): void;
}

export function cell<T>(initial: T): Cell<T> {
  let value = initial;
  const self: Cell<T> = {
    get: () => value,
    set(next) {
      const journal = journals.getStore();
      if (journal && !journal.has(self as Cell<unknown>)) journal.set(self as Cell<unknown>, value);
      value = next;
    },
  };
  return self;
}

const NONE: ReadonlyMap<unknown, unknown> = new Map();

/** One transaction at a time across every in-memory store: like Postgres row locks, but coarser. */
let tail: Promise<unknown> = Promise.resolve();

const serialized = <T>(work: () => Promise<T>): Promise<T> => {
  const next = tail.then(work, work);
  tail = next.catch(() => undefined);
  return next;
};

function rollback(journal: Journal): void {
  for (const [state, before] of journal) state.set(before);
}

/**
 * The in-memory unit of work: transactions run one after the other, and every cell written inside one is put back when
 * it throws. The repositories are the shared in-memory ones, so `work` receives none to rebind. A transaction opened
 * inside another one joins it.
 */
export function createInMemoryTransaction(onEffectError?: (error: unknown) => void): TransactionPort {
  return {
    onEffectError,
    run<T>(work: (repositories: ReadonlyMap<unknown, unknown>) => Promise<T>): Promise<T> {
      if (journals.getStore()) return work(NONE);
      return serialized(async () => {
        const journal: Journal = new Map();
        try {
          return await journals.run(journal, () => work(NONE));
        } catch (error) {
          rollback(journal);
          throw error;
        }
      });
    },
  };
}
