import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import type { JobRequestDeps, JobRequestRepository } from '../job-request-ports.js';
import { userActor } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import type { TransactionPort } from '../transaction.js';
import { approveJobRequest, convertJobRequest, rejectJobRequest } from '../use-cases/job-requests/decisions.js';
import { submitJobRequest } from '../use-cases/job-requests/requests.js';
import { createDrizzleUnitOfWork, type DrizzleUnitOfWork } from './drizzle-repositories.js';

/** Job request decisions racing on real Postgres (#10): both sides read `submitted` before either writes. */
let handle: DbHandle;
let uow: DrizzleUnitOfWork;

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 6);
  uow = createDrizzleUnitOfWork(handle.db);
});
afterAll(async () => {
  await handle.close();
});

const REQUEST = { title: 'Senior Backend Developer', reason: 'The team grows', salaryMin: 45000, salaryMax: 55000 };

/** Resolves once `parties` callers are waiting. */
function barrier(parties: number): () => Promise<void> {
  let waiting = 0;
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return async () => {
    waiting += 1;
    if (waiting >= parties) open();
    await opened;
  };
}

/** Deps whose job requests, inside the transaction, wait at `gate` after `findById`. */
function gatedDeps(gate: () => Promise<void>): JobRequestDeps {
  const r = uow.repositories;
  const wrap = (repository: JobRequestRepository): JobRequestRepository => ({
    ...repository,
    findById: async (organizationId, id) => {
      const found = await repository.findById(organizationId, id);
      await gate();
      return found;
    },
  });
  const outside = wrap(r.jobRequests);
  const transaction: TransactionPort = {
    run: (work) => uow.transaction.run((repositories, scope) => work(new Map([...repositories, [outside, wrap(repositories.get(r.jobRequests) as JobRequestRepository)]]), scope)),
  };
  return {
    auditLog: r.auditLog,
    transaction,
    jobRequests: outside,
    jobs: r.jobs,
    approvals: r.approvals,
    organizationSettings: r.organizationSettings,
    members: r.members,
    notifications: r.notifications,
    newId: randomUUID,
    now: () => new Date(),
  };
}

async function world(): Promise<{ readonly org: string; readonly requestId: string }> {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const request = await submitJobRequest(gatedDeps(async () => undefined), userActor({ id: 'hm_1', role: 'hiring_manager', organizationId: org }), REQUEST);
  return { org, requestId: request.id };
}

const count = async (sql: string, params: readonly unknown[]): Promise<number> => (await handle.pool.query<{ n: number }>(sql, [...params])).rows[0]?.n ?? 0;
const rejectedReasons = (results: readonly PromiseSettledResult<unknown>[]) => results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason as unknown);

describe('job request decisions on Postgres (#10)', () => {
  it('an approval and a rejection at the same time: one wins, the other is a conflict, one decision audited', async () => {
    const { org, requestId } = await world();
    const deps = gatedDeps(barrier(2));
    const owner = userActor({ id: 'owner_1', role: 'owner', organizationId: org });
    const results = await Promise.allSettled([approveJobRequest(deps, owner, { requestId }), rejectJobRequest(deps, owner, { requestId, note: 'no budget' })]);
    expect(rejectedReasons(results)).toEqual([expect.any(ConflictError)]);
    expect(await count(`select count(*)::int as n from audit_log where target_id = $1 and action in ('job_request.approved', 'job_request.rejected')`, [requestId])).toBe(1);
  });

  it('a double convert at the same time creates exactly one job', async () => {
    const { org, requestId } = await world();
    const deps = gatedDeps(barrier(2));
    const hm = userActor({ id: 'hm_1', role: 'hiring_manager', organizationId: org });
    const results = await Promise.allSettled([convertJobRequest(deps, hm, { requestId }), convertJobRequest(deps, hm, { requestId })]);
    expect(rejectedReasons(results)).toEqual([expect.any(ConflictError)]);
    expect(await count(`select count(*)::int as n from job where organization_id = $1`, [org])).toBe(1);
    expect(await count(`select count(*)::int as n from audit_log where organization_id = $1 and action = 'job.created'`, [org])).toBe(1);
  });
});
