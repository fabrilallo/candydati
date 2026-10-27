import { and, count, desc, eq, schema, sql } from '@candydati/db';
import type { JobApproval, JobRequest } from '@candydati/domain';
import type {
  JobApprovalRepository,
  JobRequestRepository,
  OrganizationSettingsRepository,
  StaleJob,
  StaleJobRepository,
} from '../job-request-ports.js';
import type { DbExecutor } from './db-executor.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { sequential } from '../sequential.js';

type Row = typeof schema.jobRequest.$inferSelect;

const toRequest = (row: Row): JobRequest => ({
  id: row.id,
  organizationId: row.organizationId,
  requestedBy: row.requestedBy,
  title: row.title,
  ...(row.role === null ? {} : { role: row.role }),
  ...(row.customRole === null ? {} : { customRole: row.customRole }),
  ...(row.seniority === null ? {} : { seniority: row.seniority }),
  reason: row.reason,
  headcount: row.headcount,
  salaryMin: row.salaryMin,
  salaryMax: row.salaryMax,
  currency: row.currency,
  ...(row.workMode === null ? {} : { workMode: row.workMode }),
  location: row.location,
  ...(row.desiredStart === null ? {} : { desiredStart: row.desiredStart }),
  processNotes: row.processNotes,
  interviewersNotes: row.interviewersNotes,
  language: row.language,
  status: row.status,
  decidedBy: row.decidedBy,
  decidedAt: row.decidedAt,
  decisionNote: row.decisionNote,
  jobId: row.jobId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toValues = (request: JobRequest) => ({
  ...request,
  role: request.role ?? null,
  customRole: request.customRole ?? null,
  seniority: request.seniority ?? null,
  workMode: request.workMode ?? null,
  desiredStart: request.desiredStart ?? null,
});

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleJobRequests(db: DbExecutor): JobRequestRepository {
  const { jobRequest: table } = schema;
  const own = (organizationId: string, id: string) => and(eq(table.organizationId, organizationId), eq(table.id, id));
  return {
    async create(request) {
      const [row] = await db.insert(table).values(toValues(request)).returning();
      if (!row) throw new Error('job_request insert returned no row');
      return toRequest(row);
    },
    async transition(from, request) {
      const { id, organizationId, ...values } = toValues(request);
      const [row] = await db.update(table).set(values).where(and(own(organizationId, id), eq(table.status, from))).returning();
      return row ? toRequest(row) : null;
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(table).where(own(organizationId, id)).limit(1);
      return row ? toRequest(row) : null;
    },
    async list(query) {
      const where = and(eq(table.organizationId, query.organizationId), ...(query.status ? [eq(table.status, query.status)] : []));
      const [items, totals] = await sequential(
        () => db.select().from(table).where(where).orderBy(desc(table.createdAt), desc(table.id)).limit(query.limit).offset((query.page - 1) * query.limit),
        () => db.select({ total: count() }).from(table).where(where),
      );
      return { items: items.map(toRequest), total: totals[0]?.total ?? 0 };
    },
    async findOpenForJob(organizationId, jobId) {
      const [row] = await db.select().from(table).where(and(eq(table.organizationId, organizationId), eq(table.jobId, jobId), eq(table.status, 'submitted'))).limit(1);
      return row ? toRequest(row) : null;
    },
  };
}

export function createDrizzleOrganizationSettings(db: DbExecutor): OrganizationSettingsRepository {
  const { organizationSetting: table } = schema;
  return {
    async get(organizationId) {
      const [row] = await db.select().from(table).where(eq(table.organizationId, organizationId)).limit(1);
      return { requireApproval: row?.requireApproval ?? false, restrictRecruitersToTeam: row?.restrictRecruitersToTeam ?? false };
    },
    async setRequireApproval(organizationId, value, at) {
      const [row] = await db
        .insert(table)
        .values({ organizationId, requireApproval: value, updatedAt: at })
        .onConflictDoUpdate({ target: table.organizationId, set: { requireApproval: value, updatedAt: at } })
        .returning();
      return { requireApproval: row?.requireApproval ?? value, restrictRecruitersToTeam: row?.restrictRecruitersToTeam ?? false };
    },
    async setRestrictRecruitersToTeam(organizationId, value, at) {
      const [row] = await db
        .insert(table)
        .values({ organizationId, restrictRecruitersToTeam: value, updatedAt: at })
        .onConflictDoUpdate({ target: table.organizationId, set: { restrictRecruitersToTeam: value, updatedAt: at } })
        .returning();
      return { requireApproval: row?.requireApproval ?? false, restrictRecruitersToTeam: row?.restrictRecruitersToTeam ?? value };
    },
  };
}

/** The approval columns of `job`. `jobs.save` never writes them, so an edit cannot forge or wipe an approval. */
export function createDrizzleJobApprovals(db: DbExecutor): JobApprovalRepository {
  const { job } = schema;
  return {
    async find(organizationId, jobId) {
      const [row] = await db.select().from(job).where(and(eq(job.organizationId, organizationId), eq(job.id, jobId))).limit(1);
      if (!row || row.approvalApprovedBy === null || row.approvalApprovedAt === null || row.approvalSalaryMin === null || row.approvalSalaryMax === null || row.approvalCurrency === null) {
        return null;
      }
      const approval: JobApproval = {
        approvedBy: row.approvalApprovedBy,
        approvedAt: row.approvalApprovedAt,
        salaryMin: row.approvalSalaryMin,
        salaryMax: row.approvalSalaryMax,
        currency: row.approvalCurrency as JobApproval['currency'],
      };
      return approval;
    },
    async set(organizationId, jobId, approval) {
      await db
        .update(job)
        .set({
          approvalApprovedBy: approval.approvedBy,
          approvalApprovedAt: approval.approvedAt,
          approvalSalaryMin: approval.salaryMin,
          approvalSalaryMax: approval.salaryMax,
          approvalCurrency: approval.currency,
        })
        .where(and(eq(job.organizationId, organizationId), eq(job.id, jobId)));
    },
  };
}

/**
 * The last activity of a published job: the latest of its own publication and update and of its applications' creation,
 * stage change and closing (a move or a decision).
 */
export function createDrizzleStaleJobs(db: DbExecutor): StaleJobRepository {
  const jobs = createDrizzleJobs(db);
  return {
    async listStale(cutoff, organizationId) {
      const { rows } = await db.execute<{ id: string; organization_id: string; last_activity_at: Date }>(sql`
        select j.id, j.organization_id, activity.at as last_activity_at
        from job j
        cross join lateral (
          select greatest(
            coalesce(j.published_at, j.updated_at),
            j.updated_at,
            coalesce((
              select max(greatest(a.created_at, a.stage_changed_at, coalesce(a.closed_at, a.created_at)))
              from application a
              where a.job_id = j.id and a.organization_id = j.organization_id
            ), j.updated_at)
          ) as at
        ) activity
        where j.status = 'published'
          and activity.at <= ${cutoff}
          ${organizationId === undefined ? sql`` : sql`and j.organization_id = ${organizationId}`}
        order by activity.at asc, j.id asc
      `);
      const result: StaleJob[] = [];
      for (const row of rows) {
        const job = await jobs.findById(row.organization_id, row.id);
        if (job) result.push({ job, lastActivityAt: new Date(row.last_activity_at) });
      }
      return result;
    },
  };
}
