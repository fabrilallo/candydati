import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import type { Interview } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApplication, buildCandidate, buildJob } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleErasureStore } from './drizzle-erasure.js';
import { createDrizzleInterviews } from './drizzle-interviews.js';
import { createDrizzleJobs } from './drizzle-jobs.js';

let handle: DbHandle;
const NOW = new Date('2026-06-01T07:00:00Z');
const at = (iso: string) => new Date(iso);

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => handle.close());

async function world() {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: org, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  await createDrizzleJobs(handle.db).create(buildJob({ id: jobId, slug: jobId, organizationId: org }));
  const application = async () => {
    const candidateId = randomUUID();
    await createDrizzleCandidates(handle.db).create(buildCandidate({ id: candidateId, organizationId: org, email: `${candidateId}@x.example` }));
    const id = randomUUID();
    await createDrizzleApplications(handle.db).create(buildApplication({ id, organizationId: org, jobId, candidateId }));
    return id;
  };
  return { org, jobId, application };
}

const interviewOf = (org: string, jobId: string, applicationId: string, overrides: Partial<Interview> = {}): Interview => ({
  id: randomUUID(), organizationId: org, applicationId, jobId, stageId: 'stage-1', status: 'proposed', durationMinutes: 60, mode: 'video', location: null,
  startsAt: null, endsAt: null, tokenHash: randomUUID(), tokenExpiresAt: at('2026-06-15T00:00:00Z'), icsSequence: 0, proposedBy: 'u', bookedAt: null,
  cancelledAt: null, cancelledBy: null, reminderSentAt: null, createdAt: NOW, updatedAt: NOW,
  interviewers: [{ kind: 'member', userId: 'hugo', email: null, name: 'Hugo' }, { kind: 'external', userId: null, email: 'eva@x.example', name: 'Eva' }],
  ...overrides,
});

describe('interviews on Postgres', () => {
  it('stores an interview with its people in order, one open per application and stage', async () => {
    const w = await world();
    const repo = createDrizzleInterviews(handle.db);
    const appId = await w.application();
    const created = await repo.create(interviewOf(w.org, w.jobId, appId));
    expect(await repo.findById(w.org, created.id)).toEqual(created);
    expect(await repo.findByTokenHash(created.tokenHash)).toEqual(created);
    expect(await repo.findById(randomUUID(), created.id)).toBeNull();
    await expect(repo.create(interviewOf(w.org, w.jobId, appId))).rejects.toMatchObject({ name: 'ConflictError' });
    await repo.update(w.org, created.id, { statuses: ['proposed'], icsSequence: 0 }, { status: 'cancelled' });
    expect((await repo.create(interviewOf(w.org, w.jobId, appId))).status).toBe('proposed');
    expect(await repo.listByApplication(w.org, appId)).toHaveLength(2);
  });

  it('changes only an interview that is still as expected', async () => {
    const w = await world();
    const repo = createDrizzleInterviews(handle.db);
    const created = await repo.create(interviewOf(w.org, w.jobId, await w.application()));
    const patch = { status: 'booked' as const, startsAt: at('2026-06-02T08:00:00Z'), endsAt: at('2026-06-02T09:00:00Z') };
    expect(await repo.update(w.org, created.id, { statuses: ['proposed'], icsSequence: 1 }, patch)).toBeNull();
    expect(await repo.update(w.org, created.id, { statuses: ['proposed'], icsSequence: 0 }, patch)).toMatchObject({ status: 'booked', interviewers: created.interviewers });
    expect(await repo.update(w.org, created.id, { statuses: ['proposed'], icsSequence: 0 }, patch)).toBeNull();
  });

  it('gives the booked times of members, and the interviews to remind', async () => {
    const w = await world();
    const repo = createDrizzleInterviews(handle.db);
    const booked = await repo.create(interviewOf(w.org, w.jobId, await w.application(), { status: 'booked', startsAt: at('2026-06-02T08:00:00Z'), endsAt: at('2026-06-02T09:00:00Z') }));
    await repo.create(interviewOf(w.org, w.jobId, await w.application()));
    const window = { from: NOW, to: at('2026-06-16T00:00:00Z') };
    expect(await repo.bookedBusy(w.org, ['hugo', 'nobody'], window)).toEqual(new Map([['hugo', [{ start: at('2026-06-02T08:00:00Z'), end: at('2026-06-02T09:00:00Z') }]]]));
    expect(await repo.bookedBusy(w.org, ['hugo'], window, booked.id)).toEqual(new Map());
    expect(await repo.bookedBusy(randomUUID(), ['hugo'], window)).toEqual(new Map());
    const due = await repo.listToRemind({ from: at('2026-06-01T08:00:00Z'), to: at('2026-06-02T08:30:00Z') });
    expect(due.map((item) => item.id)).toContain(booked.id);
  });

  it('serializes bookings of the same people inside transactions', async () => {
    const w = await world();
    const order: string[] = [];
    const hold = handle.db.transaction(async (tx) => {
      await createDrizzleInterviews(tx).lockPeople(w.org, ['b', 'a']);
      order.push('first locked');
      await new Promise((resolve) => setTimeout(resolve, 150));
      order.push('first done');
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const wait = handle.db.transaction(async (tx) => {
      await createDrizzleInterviews(tx).lockPeople(w.org, ['a']);
      order.push('second locked');
    });
    await Promise.all([hold, wait]);
    expect(order).toEqual(['first locked', 'first done', 'second locked']);
  });

  it('goes with its application when the candidate is erased', async () => {
    const w = await world();
    const repo = createDrizzleInterviews(handle.db);
    const appId = await w.application();
    const created = await repo.create(interviewOf(w.org, w.jobId, appId));
    await handle.db.transaction(async (tx) => void (await createDrizzleErasureStore(tx).deleteApplications(w.org, [appId])));
    expect(await repo.findById(w.org, created.id)).toBeNull();
  });
});
