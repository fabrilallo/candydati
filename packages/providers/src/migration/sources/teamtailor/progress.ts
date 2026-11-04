import type { TeamtailorClient } from './client.js';

/** The lists whose records `tick` counts, in the order they are read (stages are not counted: they are per job). */
const COUNTED = [
  ['/users', 'users', {}],
  ['/jobs', 'jobs', { 'filter[status]': 'all' }],
  ['/reject-reasons', 'rejectReasons', {}],
  ['/job-applications', 'applications', {}],
  ['/questions', 'questions', {}],
  ['/answers', 'answers', {}],
  ['/candidates', 'candidates', {}],
  ['/uploads', 'uploads', {}],
  ['/notes', 'notes', {}],
] as const;

/**
 * How many records the run will read, from each list's `meta.record-count` (one tiny request per list), so the operator
 * sees "done of total". Null when any list does not say: the progress bar is then indeterminate rather than wrong.
 */
export async function countRecords(client: TeamtailorClient): Promise<number | null> {
  let total = 0;
  for (const [path, page, params] of COUNTED) {
    const count = await client.count(path, page, params);
    if (count === null) return null;
    total += count;
  }
  return total;
}
