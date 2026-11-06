import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApplication, buildCandidate, buildJob, buildMoveProposal } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleMoveProposals } from './drizzle-move-proposals.js';

let handle: DbHandle;

async function world() {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const job = buildJob({ id: randomUUID(), slug: randomUUID(), organizationId: org });
  await createDrizzleJobs(handle.db).create(job);
  const candidate = buildCandidate({ id: randomUUID(), organizationId: org, email: `${randomUUID()}@x.it` });
  await createDrizzleCandidates(handle.db).create(candidate);
  const application = buildApplication({ id: randomUUID(), organizationId: org, jobId: job.id, candidateId: candidate.id });
  await createDrizzleApplications(handle.db).create(application);
  const proposal = (overrides = {}) => buildMoveProposal({ id: randomUUID(), organizationId: org, applicationId: application.id, jobId: job.id, ruleId: null, ...overrides });
  return { org, job, application, proposal };
}

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 2);
});

afterAll(async () => {
  await handle.close();
});

describe('move proposals on Postgres', () => {
  it('keeps who wrote a proposal and its reason, and reads a rule\'s as before', async () => {
    const w = await world();
    const repo = createDrizzleMoveProposals(handle.db);
    const mcp = w.proposal({ source: 'connected_app', reason: 'Clear answers <b>on</b> Postgres' });
    expect(await repo.createIfNoneOpen(mcp)).toEqual(mcp);
    expect(await repo.findById(w.org, mcp.id)).toMatchObject({ source: 'connected_app', reason: 'Clear answers <b>on</b> Postgres' });
    const legacy = await world();
    const [row] = await handle.db
      .insert(schema.moveProposal)
      .values({ id: randomUUID(), organizationId: legacy.org, applicationId: legacy.application.id, jobId: legacy.job.id, fromStageId: 'received', toStageId: 'stage-0', proposedBy: 'u1', expiresAt: new Date('2099-01-01T00:00:00Z') })
      .returning();
    expect(await repo.findById(legacy.org, row!.id)).toMatchObject({ source: 'rule', reason: null });
  });

  it('keeps at most one open proposal per application, and resolves it once', async () => {
    const w = await world();
    const repo = createDrizzleMoveProposals(handle.db);
    const first = await repo.createIfNoneOpen(w.proposal());
    expect(first).not.toBeNull();
    expect(await repo.createIfNoneOpen(w.proposal())).toBeNull();
    expect((await repo.listOpen({ organizationId: w.org, limit: 10 })).map((p) => p.id)).toEqual([first?.id]);
    expect(await repo.listOpen({ organizationId: w.org, jobIds: [], limit: 10 })).toEqual([]);
    const resolved = await repo.resolve(w.org, first?.id ?? '', { status: 'dismissed', resolvedBy: 'u1', resolvedAt: new Date() });
    expect(resolved).toMatchObject({ status: 'dismissed', resolvedBy: 'u1' });
    expect(await repo.resolve(w.org, first?.id ?? '', { status: 'confirmed', resolvedBy: 'u2', resolvedAt: new Date() })).toBeNull();
    expect(await repo.createIfNoneOpen(w.proposal())).not.toBeNull();
  });

  it('drops the open proposals of an application, expires old ones, and filters by organization', async () => {
    const w = await world();
    const other = await world();
    const repo = createDrizzleMoveProposals(handle.db);
    await repo.createIfNoneOpen(w.proposal());
    expect(await repo.findById(other.org, (await repo.listOpen({ organizationId: w.org, limit: 1 }))[0]?.id ?? '')).toBeNull();
    expect(await repo.dropOpenForApplication(other.org, w.application.id, new Date())).toBe(0);
    expect(await repo.dropOpenForApplication(w.org, w.application.id, new Date())).toBe(1);
    await repo.createIfNoneOpen(w.proposal({ expiresAt: new Date('2000-01-01T00:00:00Z') }));
    expect(await repo.expireDue(new Date())).toBeGreaterThanOrEqual(1);
    expect(await repo.listOpen({ organizationId: w.org, limit: 10 })).toEqual([]);
  });
});
