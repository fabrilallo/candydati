export * from './client.js';
export * from './migrate.js';
export * as schema from './schema/index.js';

/** Re-exported so consumers share this package's drizzle instance (types are not compatible across copies). */
export { and, asc, count, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, not, or, sql } from 'drizzle-orm';
export type { SQL } from 'drizzle-orm';
export * from './query-overlap-guard.js';
