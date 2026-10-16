import type { JobViewKey, JobViewRepository, JobViewRow } from '../job-view-ports.js';
import type { CandidateStore } from './in-memory-candidates.js';

const same = (a: JobViewKey, b: JobViewKey): boolean =>
  a.organizationId === b.organizationId && a.jobId === b.jobId && a.day === b.day && a.source === b.source && a.campaign === b.campaign;

/** The counters live in the candidate store so the in-memory reports read them. */
export function createInMemoryJobViews(store: CandidateStore): JobViewRepository {
  return {
    async increment(key, by = 1) {
      const rows = store.read().jobViews;
      const existing = rows.find((row) => same(row, key));
      const next: readonly JobViewRow[] = existing
        ? rows.map((row) => (row === existing ? { ...row, views: row.views + by } : row))
        : [...rows, { organizationId: key.organizationId, jobId: key.jobId, day: key.day, source: key.source, campaign: key.campaign, views: by }];
      store.write({ jobViews: next });
    },
    async purgeBefore(day) {
      const rows = store.read().jobViews;
      const kept = rows.filter((row) => row.day >= day);
      store.write({ jobViews: kept });
      return rows.length - kept.length;
    },
  };
}
