import type { JobApproval, JobRequest } from '@candydati/domain';
import type {
  JobApprovalRepository,
  JobRequestRepository,
  OrganizationSettings,
  OrganizationSettingsRepository,
  StaleJob,
  StaleJobRepository,
} from '../job-request-ports.js';
import type { CandidateStore } from './in-memory-candidates.js';
import type { InMemoryJobRepository } from './in-memory-jobs.js';
import { cell } from './in-memory-transaction.js';

export interface InMemoryJobRequests extends JobRequestRepository {
  snapshot(): readonly JobRequest[];
}

export function createInMemoryJobRequests(initial: readonly JobRequest[] = []): InMemoryJobRequests {
  const rows = cell<readonly JobRequest[]>([...initial]);
  const inOrg = (organizationId: string) => rows.get().filter((r) => r.organizationId === organizationId);
  return {
    async create(request) {
      rows.set([...rows.get(), request]);
      return request;
    },
    async transition(from, request) {
      const current = rows.get().find((r) => r.organizationId === request.organizationId && r.id === request.id);
      if (!current || current.status !== from) return null;
      rows.set(rows.get().map((r) => (r === current ? request : r)));
      return request;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((r) => r.id === id) ?? null;
    },
    async list(query) {
      const matching = inOrg(query.organizationId)
        .filter((r) => query.status === undefined || r.status === query.status)
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
      const start = (query.page - 1) * query.limit;
      return { items: matching.slice(start, start + query.limit), total: matching.length };
    },
    async findOpenForJob(organizationId, jobId) {
      return inOrg(organizationId).find((r) => r.jobId === jobId && r.status === 'submitted') ?? null;
    },
    snapshot: () => rows.get(),
  };
}

const DEFAULT_SETTINGS: OrganizationSettings = { requireApproval: false, restrictRecruitersToTeam: false };

export function createInMemoryOrganizationSettings(initial: Readonly<Record<string, Partial<OrganizationSettings>>> = {}): OrganizationSettingsRepository {
  const rows = cell<Readonly<Record<string, OrganizationSettings>>>(
    Object.fromEntries(Object.entries(initial).map(([id, settings]) => [id, { ...DEFAULT_SETTINGS, ...settings }])),
  );
  return {
    async get(organizationId) {
      return rows.get()[organizationId] ?? DEFAULT_SETTINGS;
    },
    async setRequireApproval(organizationId, value) {
      const next = { ...(rows.get()[organizationId] ?? DEFAULT_SETTINGS), requireApproval: value };
      rows.set({ ...rows.get(), [organizationId]: next });
      return next;
    },
    async setRestrictRecruitersToTeam(organizationId, value) {
      const next = { ...(rows.get()[organizationId] ?? DEFAULT_SETTINGS), restrictRecruitersToTeam: value };
      rows.set({ ...rows.get(), [organizationId]: next });
      return next;
    },
  };
}

export interface InMemoryJobApprovals extends JobApprovalRepository {
  snapshot(): ReadonlyMap<string, JobApproval>;
}

export function createInMemoryJobApprovals(): InMemoryJobApprovals {
  const rows = cell(new Map<string, JobApproval>());
  const key = (organizationId: string, jobId: string) => `${organizationId}\u0000${jobId}`;
  return {
    async find(organizationId, jobId) {
      return rows.get().get(key(organizationId, jobId)) ?? null;
    },
    async set(organizationId, jobId, approval) {
      rows.set(new Map(rows.get()).set(key(organizationId, jobId), approval));
    },
    snapshot: () => rows.get(),
  };
}

/** Same rule as the Postgres query, over the in-memory job and application stores. */
export function createInMemoryStaleJobs(jobs: InMemoryJobRepository, store: CandidateStore): StaleJobRepository {
  return {
    async listStale(cutoff, organizationId) {
      const stale: StaleJob[] = [];
      for (const job of jobs.snapshot()) {
        if (job.status !== 'published' || (organizationId !== undefined && job.organizationId !== organizationId)) continue;
        const times = [job.publishedAt ?? job.updatedAt, job.updatedAt];
        for (const a of store.read().applications) {
          if (a.organizationId === job.organizationId && a.jobId === job.id) times.push(a.createdAt, a.stageChangedAt, a.closedAt ?? a.createdAt);
        }
        const lastActivityAt = new Date(Math.max(...times.map((t) => t.getTime())));
        if (lastActivityAt <= cutoff) stale.push({ job, lastActivityAt });
      }
      return stale.toSorted((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime() || a.job.id.localeCompare(b.job.id));
    },
  };
}
