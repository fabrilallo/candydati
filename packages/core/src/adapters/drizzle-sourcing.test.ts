import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import type { SourcedContact } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCandidate, buildJob } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleSourcedContacts, createDrizzleSourcingCandidateLookup, createDrizzleSourcingObjections } from './drizzle-sourcing.js';

let handle: DbHandle;
const NOW = new Date('2026-11-06T10:00:00Z');

async function world() {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const job = buildJob({ id: randomUUID(), slug: randomUUID(), organizationId: org });
  await createDrizzleJobs(handle.db).create(job);
  const contact = (overrides: Partial<SourcedContact> = {}): SourcedContact => ({
    id: randomUUID(), organizationId: org, jobId: job.id, firstName: 'Maja', lastName: 'Lind', headline: null, location: 'Stockholm', source: 'linkedin',
    profileUrl: 'https://www.linkedin.com/in/maja', profileKey: 'linkedin.com/in/maja', email: null, evidence: [{ criterion: 'Go', text: '4 years', where: null }],
    status: 'found', noticeTokenHash: randomUUID(), noticeSentAt: null, contactedAt: null, expiresAt: new Date(NOW.getTime() + 30 * 86_400_000), createdBy: 'u1', createdAt: NOW, ...overrides,
  });
  return { org, job, contact };
}

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 2);
});
afterAll(async () => {
  await handle.close();
});

describe('sourced contacts on Postgres', () => {
  it('stores, finds, updates and erases contacts per organization, one per profile and job', async () => {
    const w = await world();
    const repo = createDrizzleSourcedContacts(handle.db);
    const maja = await repo.create(w.contact());
    expect(await repo.findById(w.org, maja.id)).toEqual(maja);
    expect(await repo.findById(randomUUID(), maja.id)).toBeNull();
    await expect(repo.create(w.contact())).rejects.toThrow();
    const bo = await repo.create(w.contact({ firstName: 'Bo', profileUrl: 'https://github.com/bo', profileKey: 'github.com/bo', email: 'bo@example.com', source: 'github', createdAt: new Date(NOW.getTime() + 1000) }));
    expect((await repo.listByJob(w.org, w.job.id)).map((c) => c.id)).toEqual([bo.id, maja.id]);
    expect((await repo.findMatching(w.org, { profileKeys: ['linkedin.com/in/maja'], emails: ['bo@example.com'] })).map((c) => c.id).sort()).toEqual([maja.id, bo.id].sort());
    expect(await repo.findMatching(w.org, { profileKeys: [], emails: [] })).toEqual([]);
    expect(await repo.update(w.org, maja.id, { status: 'contacted', contactedAt: NOW })).toMatchObject({ status: 'contacted' });
    expect((await repo.findByNoticeHash(bo.noticeTokenHash))?.id).toBe(bo.id);
    expect(await repo.deleteExpired(new Date(NOW.getTime() + 31 * 86_400_000))).toBeGreaterThanOrEqual(2);
    expect(await repo.listByJob(w.org, w.job.id)).toEqual([]);
  });

  it('keeps objections as hashes, once each', async () => {
    const w = await world();
    const repo = createDrizzleSourcingObjections(handle.db);
    await repo.add(w.org, ['a', 'b', 'a'], NOW);
    await repo.add(w.org, ['b'], NOW);
    expect([...(await repo.existing(w.org, ['a', 'c']))]).toEqual(['a']);
    expect((await repo.existing(randomUUID(), ['a'])).size).toBe(0);
  });

  it('finds candidates by email or by the same LinkedIn profile, never a longer slug', async () => {
    const w = await world();
    const candidates = createDrizzleCandidates(handle.db);
    await candidates.create(buildCandidate({ id: randomUUID(), organizationId: w.org, email: `Ada-${w.org}@example.com`, linkedinUrl: 'https://it.linkedin.com/in/ada/' }));
    await candidates.create(buildCandidate({ id: randomUUID(), organizationId: w.org, email: `adam-${w.org}@example.com`, linkedinUrl: 'https://www.linkedin.com/in/adam' }));
    const lookup = createDrizzleSourcingCandidateLookup(handle.db);
    expect((await lookup.findMatching(w.org, { profileKeys: ['linkedin.com/in/ada'], emails: [] })).map((c) => c.linkedinUrl)).toEqual(['https://it.linkedin.com/in/ada/']);
    expect(await lookup.findMatching(w.org, { profileKeys: [], emails: [`ada-${w.org}@example.com`] })).toHaveLength(1);
    expect(await lookup.findMatching(randomUUID(), { profileKeys: ['linkedin.com/in/ada'], emails: [] })).toEqual([]);
  });
});
