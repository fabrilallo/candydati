import { randomUUID } from 'node:crypto';
import { createDb, schema, sql, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApplication, buildCandidate, buildJob, createInMemoryFileStorage, createInMemoryTaskQueue } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { eraseCandidateData } from '../use-cases/privacy/erase-candidate-data.js';
import { stillDue } from '../use-cases/privacy/run-retention.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleErasure } from './drizzle-erasure.js';
import { createDrizzleJobs } from './drizzle-jobs.js';

let handle: DbHandle;
const NOW = new Date('2026-06-01T03:00:00Z');
const PAST = new Date('2026-05-01T00:00:00Z');
const SYSTEM = { type: 'system', id: null, onBehalfOfUserId: null } as const;

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 6);
});
afterAll(async () => {
  await handle.close();
});

async function seed(): Promise<{ org: string; candidateId: string; applicationId: string }> {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  await createDrizzleJobs(handle.db).create(buildJob({ id: jobId, slug: jobId, organizationId: org }));
  const candidateId = randomUUID();
  await createDrizzleCandidates(handle.db).create(buildCandidate({ id: candidateId, organizationId: org, email: `${candidateId}@example.org` }));
  const applicationId = randomUUID();
  await createDrizzleApplications(handle.db).create(
    buildApplication({ id: applicationId, organizationId: org, jobId, candidateId, consentStatus: 'to_renew', retentionExpiresAt: PAST, reconfirmationSentAt: PAST }),
  );
  return { org, candidateId, applicationId };
}

/** Polls until a backend of this database is waiting on a lock: the erasure is blocked, not merely slow. */
async function waitUntilBlocked(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await handle.db.execute<{ blocked: number }>(
      sql`select count(*)::int as blocked from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if ((rows[0]?.blocked ?? 0) > 0) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('the erasure never waited for the lock');
}

describe('retention erasure on Postgres (#2)', () => {
  it('waits for a reconfirmation in progress, then sees it and keeps the person', async () => {
    const { org, candidateId, applicationId } = await seed();
    const deps = { applications: createDrizzleApplications(handle.db), erasure: createDrizzleErasure(handle.db), files: createInMemoryFileStorage(), queue: createInMemoryTaskQueue(), newId: randomUUID, now: () => NOW };
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    // The reconfirmation holds the candidate row (as `reconfirmIn` does when it saves the candidate) until released.
    const reconfirmation = handle.db.transaction(async (tx) => {
      await tx.update(schema.candidate).set({ updatedAt: NOW }).where(sql`${schema.candidate.id} = ${candidateId}`);
      await tx.update(schema.application).set({ consentStatus: 'given', retentionExpiresAt: new Date('2028-01-01T00:00:00Z') }).where(sql`${schema.application.id} = ${applicationId}`);
      await released;
    });
    const erasure = eraseCandidateData(deps, { organizationId: org, candidateId, reason: 'consent_not_renewed', actor: SYSTEM, onlyIf: stillDue(NOW, 'to_renew') });
    await waitUntilBlocked();
    release();
    await reconfirmation;
    expect(await erasure).toEqual({ applicationCount: 0, candidateErased: false });
    expect(await deps.applications.findById(org, applicationId)).toMatchObject({ consentStatus: 'given' });
  });

  it('erases an imported person who was asked and did not answer, and never one who was never asked', async () => {
    const asked = await seed();
    const deps = { applications: createDrizzleApplications(handle.db), erasure: createDrizzleErasure(handle.db), files: createInMemoryFileStorage(), queue: createInMemoryTaskQueue(), newId: randomUUID, now: () => NOW };
    await handle.db.insert(schema.consentToken).values({ tokenHash: randomUUID(), organizationId: asked.org, applicationId: asked.applicationId, expiresAt: PAST, usedAt: null, createdAt: PAST });
    const erased = await eraseCandidateData(deps, { organizationId: asked.org, candidateId: asked.candidateId, reason: 'consent_not_renewed', actor: SYSTEM, onlyIf: stillDue(NOW, 'to_renew') });
    expect(erased).toEqual({ applicationCount: 1, candidateErased: true });

    const never = await seed();
    await handle.db.update(schema.application).set({ reconfirmationSentAt: null }).where(sql`${schema.application.id} = ${never.applicationId}`);
    await handle.db.insert(schema.consentToken).values({ tokenHash: randomUUID(), organizationId: never.org, applicationId: never.applicationId, expiresAt: PAST, usedAt: null, createdAt: PAST });
    const kept = await eraseCandidateData(deps, { organizationId: never.org, candidateId: never.candidateId, reason: 'consent_not_renewed', actor: SYSTEM, onlyIf: stillDue(NOW, 'to_renew') });
    expect(kept).toEqual({ applicationCount: 0, candidateErased: false });
    expect(await deps.applications.findById(never.org, never.applicationId)).not.toBeNull();
  });
});
