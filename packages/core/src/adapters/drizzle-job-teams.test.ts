import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApplication, buildCandidate, buildJob, buildNotification, buildTask } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidateSearch } from './drizzle-candidate-search.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleStageInterviewers } from './drizzle-feedback.js';
import { createDrizzleOrganizationSettings } from './drizzle-job-requests.js';
import { createDrizzleJobTeams } from './drizzle-job-teams.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleNotifications } from './drizzle-notifications.js';
import { createDrizzleReports } from './drizzle-reports.js';
import { createDrizzleTasks } from './drizzle-tasks.js';

let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

interface World {
  readonly org: string;
  readonly jobA: string;
  readonly jobB: string;
  /** Candidate with an application on A only, on B only, and on both. */
  readonly onA: string;
  readonly onB: string;
  readonly onBoth: string;
  readonly appA: string;
  readonly appB: string;
}

async function world(): Promise<World> {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const jobs = createDrizzleJobs(handle.db);
  const [jobA, jobB] = [randomUUID(), randomUUID()];
  for (const id of [jobA, jobB]) await jobs.create(buildJob({ id, slug: id, organizationId: org, status: 'published', publishedAt: NOW }));
  const candidates = createDrizzleCandidates(handle.db);
  const applications = createDrizzleApplications(handle.db);
  const [onA, onB, onBoth] = [randomUUID(), randomUUID(), randomUUID()];
  for (const id of [onA, onB, onBoth]) await candidates.create(buildCandidate({ id, organizationId: org, email: `${id}@x.example` }));
  const add = async (candidateId: string, jobId: string) => {
    const id = randomUUID();
    await applications.create(buildApplication({ id, organizationId: org, candidateId, jobId, outcome: 'hired', closedAt: NOW, cv: { key: id, fileName: 'cv.pdf', mediaType: 'application/pdf', sizeBytes: 1 } }));
    return id;
  };
  const appA = await add(onA, jobA);
  const appB = await add(onB, jobB);
  await add(onBoth, jobA);
  await add(onBoth, jobB);
  return { org, jobA, jobB, onA, onB, onBoth, appA, appB };
}

const member = (org: string, jobId: string, userId: string, role: 'hiring_manager' | 'interviewer' | 'recruiter' = 'interviewer') => ({
  organizationId: org,
  jobId,
  userId,
  role,
  addedBy: 'system',
  createdAt: NOW,
});

describe('job teams on Postgres', () => {
  it('adds, changes the role of, lists and removes members; automatic additions never change a role', async () => {
    const w = await world();
    const teams = createDrizzleJobTeams(handle.db);
    await teams.upsert(member(w.org, w.jobA, 'u1'));
    await teams.upsert(member(w.org, w.jobA, 'u1', 'hiring_manager'));
    await teams.addIfAbsent(member(w.org, w.jobA, 'u1', 'recruiter'));
    await teams.addIfAbsent(member(w.org, w.jobA, 'u2'));
    expect((await teams.list(w.org, w.jobA)).map((m) => [m.userId, m.role])).toEqual([
      ['u1', 'hiring_manager'],
      ['u2', 'interviewer'],
    ]);
    expect(await teams.remove(w.org, w.jobA, 'u2')).toBe(true);
    expect(await teams.remove(w.org, w.jobA, 'u2')).toBe(false);
    expect(await teams.list(await (await world()).org, w.jobA)).toEqual([]);
  });

  it('finds the jobs of a person through the team and through the stages they interview at, per organization', async () => {
    const w = await world();
    const teams = createDrizzleJobTeams(handle.db);
    await teams.upsert(member(w.org, w.jobA, 'u1'));
    await createDrizzleStageInterviewers(handle.db).replaceForJob(w.org, w.jobB, [
      { id: randomUUID(), organizationId: w.org, jobId: w.jobB, stageId: 'stage-0', kind: 'member', userId: 'u1', email: null, name: 'U1', createdAt: NOW },
      { id: randomUUID(), organizationId: w.org, jobId: w.jobB, stageId: 'stage-1', kind: 'member', userId: 'u1', email: null, name: 'U1', createdAt: NOW },
    ]);
    expect((await teams.jobIdsOf(w.org, 'u1')).toSorted()).toEqual([w.jobA, w.jobB].toSorted());
    expect(await teams.jobIdsOf(w.org, 'u2')).toEqual([]);
    expect(await teams.jobIdsOf((await world()).org, 'u1')).toEqual([]);
  });

  it('narrows candidates and applications to the jobs given', async () => {
    const w = await world();
    const teams = createDrizzleJobTeams(handle.db);
    expect((await teams.candidatesIn(w.org, [w.onA, w.onB, w.onBoth], [w.jobA])).toSorted()).toEqual([w.onA, w.onBoth].toSorted());
    expect(await teams.candidatesIn(w.org, [w.onA], [])).toEqual([]);
    expect(await teams.applicationsIn(w.org, [w.appA, w.appB], [w.jobB])).toEqual([w.appB]);
    expect(await teams.applicationsIn(w.org, [], [w.jobB])).toEqual([]);
  });

  it('reads the recruiter restriction, off by default', async () => {
    const w = await world();
    const teams = createDrizzleJobTeams(handle.db);
    expect(await teams.restrictsRecruiters(w.org)).toBe(false);
    await createDrizzleOrganizationSettings(handle.db).setRestrictRecruitersToTeam(w.org, true, NOW);
    expect(await teams.restrictsRecruiters(w.org)).toBe(true);
  });
});

describe('job filters of the scoped lists on Postgres', () => {
  it('lists jobs and searches candidates only in the jobs given, counting only their applications', async () => {
    const w = await world();
    const jobs = await createDrizzleJobs(handle.db).list({ organizationId: w.org, jobIds: [w.jobA], page: 1, limit: 10 });
    expect([jobs.items.map((job) => job.id), jobs.total]).toEqual([[w.jobA], 1]);
    expect((await createDrizzleJobs(handle.db).list({ organizationId: w.org, jobIds: [], page: 1, limit: 10 })).total).toBe(0);
    const found = await createDrizzleCandidateSearch(handle.db).search({ organizationId: w.org, jobIds: [w.jobA], page: 1, limit: 10 });
    expect(found.items.map((item) => [item.candidate.id, item.applicationCount]).toSorted()).toEqual([[w.onA, 1], [w.onBoth, 1]].toSorted());
    expect(found.total).toBe(2);
  });

  it('keeps tasks and notifications about no job, and those about the jobs given', async () => {
    const w = await world();
    const tasks = createDrizzleTasks(handle.db);
    for (const [id, jobId, applicationId] of [['ta', w.jobA, w.appA], ['tb', w.jobB, w.appB], ['tn', null, null]] as const) {
      await tasks.create(buildTask({ id: `${id}-${w.org}`, organizationId: w.org, jobId, applicationId, assigneeId: 'u1' }));
    }
    const listed = await tasks.list({ organizationId: w.org, openOnly: false, jobIds: [w.jobA], limit: 10 });
    expect(listed.map((task) => task.id.split('-')[0]).toSorted()).toEqual(['ta', 'tn']);
    const notifications = createDrizzleNotifications(handle.db);
    for (const [id, jobId, applicationId] of [['na', w.jobA, w.appA], ['nb', w.jobB, w.appB], ['nn', null, null]] as const) {
      await notifications.createIfAbsent(buildNotification({ id: randomUUID(), organizationId: w.org, userId: 'u1', jobId, applicationId, taskId: null }), id);
    }
    const page = await notifications.list({ organizationId: w.org, userId: 'u1', unreadOnly: false, jobIds: [w.jobA], page: 1, limit: 10 });
    expect([page.items.length, page.total]).toEqual([2, 2]);
    expect(await notifications.unreadCount(w.org, 'u1', [w.jobA])).toBe(2);
    expect(await notifications.unreadCount(w.org, 'u1')).toBe(3);
  });

  it('aggregates reports over the jobs given only', async () => {
    const w = await world();
    const reports = createDrizzleReports(handle.db);
    const period = { organizationId: w.org, from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-12-31T00:00:00Z'), now: NOW };
    const all = await reports.aggregate(period);
    const scoped = await reports.aggregate({ ...period, jobIds: [w.jobA] });
    expect(new Set(scoped.coverage.map((row) => row.jobId))).toEqual(new Set([w.jobA]));
    expect(new Set(all.coverage.map((row) => row.jobId))).toEqual(new Set([w.jobA, w.jobB]));
    expect(scoped.hireDays.byJob.every((row) => row.jobId === w.jobA)).toBe(true);
  });
});
