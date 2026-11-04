import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import type { ScorecardCriterion } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApplication, buildCandidate, buildJob, buildNote } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidateNotes } from './drizzle-candidate-notes.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleJobTeams } from './drizzle-job-teams.js';
import { createDrizzleScorecards } from './drizzle-scorecards.js';

let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

async function orgWithJob(): Promise<{ org: string; jobId: string }> {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  await createDrizzleJobs(handle.db).create(buildJob({ id: jobId, slug: jobId, organizationId: org }));
  return { org, jobId };
}

const criterion = (org: string, jobId: string, overrides: Partial<ScorecardCriterion> = {}): ScorecardCriterion => ({
  id: randomUUID(), organizationId: org, jobId, stageId: null, label: 'Postgres experience', position: 0, createdBy: 'u', createdAt: NOW, firstUsedAt: null, retiredAt: null, ...overrides,
});

describe('scorecards on Postgres', () => {
  it('creates, edits and deletes unused criteria; once used they only move and retire', async () => {
    const { org, jobId } = await orgWithJob();
    const other = await orgWithJob();
    const repo = createDrizzleScorecards(handle.db);
    const [a, b] = [criterion(org, jobId), criterion(org, jobId, { label: 'English B2', position: 1, stageId: 'stage-1' })];
    await repo.create([a, b]);
    await repo.create([]);
    expect((await repo.listByJob(org, jobId)).map((c) => c.label)).toEqual(['Postgres experience', 'English B2']);
    expect(await repo.listByJob(other.org, jobId)).toEqual([]);
    expect(await repo.updateUnused(org, a.id, { label: 'Postgres', stageId: null, position: 2 })).toBe(true);
    await repo.markUsed(org, [a.id], NOW);
    await repo.markUsed(org, [], NOW);
    expect(await repo.updateUnused(org, a.id, { label: 'Changed', stageId: null, position: 2 })).toBe(false);
    expect(await repo.removeUnused(org, a.id)).toBe(false);
    await repo.move(org, a.id, 0);
    await repo.retire(org, a.id, NOW);
    expect(await repo.removeUnused(org, b.id)).toBe(true);
    expect(await repo.listByJob(org, jobId)).toEqual([{ ...a, label: 'Postgres', position: 0, firstUsedAt: NOW, retiredAt: NOW }]);
  });
});

describe('restricted stages and stage notes on Postgres', () => {
  it('marks and unmarks a stage once, per organization, and lists notes per application with their stage', async () => {
    const { org, jobId } = await orgWithJob();
    const teams = createDrizzleJobTeams(handle.db);
    const stage = { organizationId: org, jobId, stageId: 'stage-1', restrictedBy: 'u', createdAt: NOW };
    expect(await teams.restrictStage(stage)).toBe(true);
    expect(await teams.restrictStage(stage)).toBe(false);
    expect(await teams.listRestrictedStages(org)).toEqual([stage]);
    expect(await teams.listRestrictedStages(org, randomUUID())).toEqual([]);
    expect(await teams.unrestrictStage(org, jobId, 'stage-1')).toBe(true);
    expect(await teams.unrestrictStage(org, jobId, 'stage-1')).toBe(false);

    const candidateId = randomUUID();
    await createDrizzleCandidates(handle.db).create(buildCandidate({ id: candidateId, organizationId: org, email: `${candidateId}@x.example` }));
    const applicationId = randomUUID();
    await createDrizzleApplications(handle.db).create(buildApplication({ id: applicationId, organizationId: org, jobId, candidateId }));
    const notes = createDrizzleCandidateNotes(handle.db);
    await notes.create(buildNote({ id: randomUUID(), organizationId: org, candidateId, applicationId, stageId: 'stage-1', createdAt: NOW }));
    expect((await notes.listByApplications(org, [applicationId])).map((note) => note.stageId)).toEqual(['stage-1']);
    expect(await notes.listByApplications(org, [])).toEqual([]);
  });
});
