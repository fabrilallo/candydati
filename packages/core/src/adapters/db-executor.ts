import type { Db } from '@tt/db';

/** A `Db` or a transaction of it: the adapters only use these methods, so one factory serves both. */
export type DbExecutor = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute' | 'transaction'>;

const UNIQUE_VIOLATION = '23505';

export const isUniqueViolation = (error: unknown): boolean => {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return (error as { code?: string } | null)?.code === UNIQUE_VIOLATION || cause?.code === UNIQUE_VIOLATION;
};
