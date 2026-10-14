import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userActor } from '../testing/actors.js';
import {
  buildApplication,
  buildCandidate,
  buildExtraction,
  buildJob,
  buildNote,
  createInMemoryFileStorage,
  createInMemoryTaskQueue,
  fakePdfBytes,
} from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import type { CandidateRightsDeps } from '../privacy-ports.js';
import { eraseApplication, eraseCandidate } from '../use-cases/privacy/erase-candidate.js';
import { runRetention } from '../use-cases/privacy/run-retention.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleAuditLog } from './drizzle-audit-log.js';
import { createDrizzleCandidateNotes } from './drizzle-candidate-notes.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleCvExtractions } from './drizzle-cv-extractions.js';
import { createDrizzleErasure } from './drizzle-erasure.js';
import { createDrizzleFeedbackRequests, createDrizzleInterviewFeedback } from './drizzle-feedback.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleMemberDirectory } from './drizzle-members.js';
import { createDrizzleMessages } from './drizzle-messages.js';
import { createDrizzleNotifications } from './drizzle-notifications.js';
import { createDrizzlePrivacyNotices } from './drizzle-privacy-notices.js';
import { createDrizzleDataExports, createDrizzleRetentionRuns } from './drizzle-privacy.js';
import { ConflictError } from '../errors.js';
import { createDrizzleTransaction } from './drizzle-repositories.js';

let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');

interface Person {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
}

/** Values unique to one world: they must disappear everywhere but in the audit log (which holds ids only). */
const newPerson = (kind: 'Zelda' | 'Bruno'): Person => {
  const unique = randomUUID().slice(0, 8);
  return { firstName: `${kind}${unique}`, lastName: `Quuxington${unique}`, email: `${kind.toLowerCase()}.${unique}@example.org`, phone: '+39 333 7654321' };
};

interface World {
  readonly org: string;
  readonly jobId: string;
  readonly person: Person;
  readonly bystander: Person;
  readonly candidateId: string;
  readonly otherCandidateId: string;
  readonly applicationIds: readonly string[];
  readonly otherApplicationId: string;
  readonly files: ReturnType<typeof createInMemoryFileStorage>;
}

const newId = (): string => randomUUID();

async function insertOrg(): Promise<string> {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: `Org ${id}`, slug: id, createdAt: new Date() });
  return id;
}

async function addApplication(org: string, jobId: string, candidateId: string, person: Person, overrides = {}): Promise<string> {
  const id = randomUUID();
  const application = buildApplication({ id, organizationId: org, jobId, candidateId, cv: { key: `organizations/${org}/applications/${id}/cv`, fileName: 'cv.pdf', mediaType: 'application/pdf', sizeBytes: 64 }, ...overrides });
  await createDrizzleApplications(handle.db).create(application);
  await createDrizzleCvExtractions(handle.db).upsert(buildExtraction({ applicationId: id, organizationId: org, text: `CV text of ${person.firstName}` }));
  await createDrizzleCandidateNotes(handle.db).create(buildNote({ id: randomUUID(), organizationId: org, candidateId, applicationId: id, body: `about ${person.lastName}` }));
  await handle.db.insert(schema.conversation).values({ applicationId: id, organizationId: org, token: `${id}-token`.replaceAll('-', '').slice(0, 30) });
  for (const direction of ['outbound', 'inbound'] as const) {
    await createDrizzleMessages(handle.db).create({
      id: randomUUID(), organizationId: org, applicationId: id, candidateId, direction, subject: `Hello ${person.firstName}`, bodyText: `Dear ${person.firstName}`,
      status: direction === 'inbound' ? 'received' : 'sent', providerMessageId: null, sentBy: direction === 'inbound' ? null : 'user_x', createdAt: NOW, sentAt: NOW,
      error: null, rawText: direction === 'inbound' ? `raw from ${person.email}` : null, unverifiedSender: false, inboundMessageId: direction === 'inbound' ? `<${id}@mail>` : null,
    });
  }
  const taskId = randomUUID();
  await handle.db.insert(schema.task).values({ id: taskId, organizationId: org, applicationId: id, jobId, title: `Call ${person.firstName}`, assigneeId: 'user_x', createdBy: 'user_x' });
  await createDrizzleNotifications(handle.db).createIfAbsent(
    { id: randomUUID(), organizationId: org, userId: 'user_x', kind: 'task_due', applicationId: id, jobId, taskId, payload: {}, createdAt: NOW, readAt: null },
    `task_due:${taskId}`,
  );
  await createDrizzleNotifications(handle.db).createIfAbsent(
    { id: randomUUID(), organizationId: org, userId: 'user_y', kind: 'response_overdue', applicationId: id, jobId, taskId: null, payload: { stageId: 'received' }, createdAt: NOW, readAt: null },
    `response_overdue:${id}`,
  );
  await handle.db.insert(schema.applicationStageEvent).values({ id: randomUUID(), organizationId: org, applicationId: id, jobId, toStageId: 'received', occurredAt: NOW, actorType: 'system' });
  await handle.db.insert(schema.responsePromise).values({ id: randomUUID(), organizationId: org, applicationId: id, jobId, stageId: 'received', startedAt: NOW, dueAt: NOW, status: 'open' });
  const requestId = randomUUID();
  await handle.db.insert(schema.feedbackRequest).values({ id: requestId, organizationId: org, applicationId: id, jobId, stageId: 'stage-0', interviewerKind: 'external', interviewerEmail: 'ext@partner.example', interviewerName: 'Eva Interviewer', tokenHash: randomUUID(), expiresAt: NOW, requestedBy: 'user_x', submittedAt: NOW });
  await handle.db.insert(schema.interviewFeedback).values({ id: randomUUID(), organizationId: org, applicationId: id, requestId, stageId: 'stage-0', interviewerName: 'Eva Interviewer', answers: { tech_shown: `${person.firstName} ${person.lastName} was great` }, recommendation: 'proceed', submittedAt: NOW });
  const endpointId = randomUUID();
  await handle.db.insert(schema.webhookEndpoint).values({ id: endpointId, organizationId: org, url: 'https://hook.example/x', secret: 'whsec_x', events: ['application.received'] });
  const eventId = randomUUID();
  await handle.db.insert(schema.outboxEvent).values({ id: eventId, organizationId: org, type: 'application.received', data: { applicationId: id, jobId }, occurredAt: NOW });
  await handle.db.insert(schema.webhookDelivery).values({ id: randomUUID(), organizationId: org, endpointId, eventId, eventType: 'application.received', status: 'success', attempt: 1 });
  return id;
}

async function buildWorld(): Promise<World> {
  const org = await insertOrg();
  const job = buildJob({ id: randomUUID(), slug: randomUUID(), organizationId: org });
  await createDrizzleJobs(handle.db).create(job);
  const candidates = createDrizzleCandidates(handle.db);
  const person = newPerson('Zelda');
  const bystander = newPerson('Bruno');
  const candidateId = randomUUID();
  const otherCandidateId = randomUUID();
  await candidates.create(buildCandidate({ id: candidateId, organizationId: org, ...person }));
  await candidates.create(buildCandidate({ id: otherCandidateId, organizationId: org, ...bystander, phone: null }));
  const first = await addApplication(org, job.id, candidateId, person);
  const second = await addApplication(org, job.id, candidateId, person, { outcome: 'not_selected', closedAt: NOW });
  const other = await addApplication(org, job.id, otherCandidateId, bystander);
  await createDrizzleCandidateNotes(handle.db).create(buildNote({ id: randomUUID(), organizationId: org, candidateId, applicationId: null, body: `general about ${person.firstName}` }));
  await handle.db.insert(schema.outboxEvent).values({ id: randomUUID(), organizationId: org, type: 'application.moved', data: { candidateId, jobId: job.id }, occurredAt: NOW });
  const files = createInMemoryFileStorage();
  for (const id of [first, second, other]) await files.put(`organizations/${org}/applications/${id}/cv`, fakePdfBytes(), 'application/pdf');
  return { org, jobId: job.id, person, bystander, candidateId, otherCandidateId, applicationIds: [first, second], otherApplicationId: other, files };
}

const depsFor = (world: World, overrides: Partial<CandidateRightsDeps> = {}): CandidateRightsDeps => ({
  auditLog: createDrizzleAuditLog(handle.db),
  transaction: createDrizzleTransaction(handle.db),
  jobs: createDrizzleJobs(handle.db),
  candidates: createDrizzleCandidates(handle.db),
  applications: createDrizzleApplications(handle.db),
  notes: createDrizzleCandidateNotes(handle.db),
  extractions: createDrizzleCvExtractions(handle.db),
  messages: createDrizzleMessages(handle.db),
  feedbackRequests: createDrizzleFeedbackRequests(handle.db),
  interviewFeedback: createDrizzleInterviewFeedback(handle.db),
  privacyNotices: createDrizzlePrivacyNotices(handle.db),
  erasure: createDrizzleErasure(handle.db),
  files: world.files,
  queue: createInMemoryTaskQueue(),
  newId,
  now: () => NOW,
  ...overrides,
});

const recruiter = (org: string) => userActor({ id: 'user_x', role: 'recruiter', organizationId: org });
const fullName = (world: World): string => `${world.person.firstName} ${world.person.lastName}`;

/** Every table of the schema except `audit_log`: how many rows mention any of the needles anywhere in the row. */
async function leftovers(needles: readonly string[]): Promise<Record<string, number>> {
  const { rows: tables } = await handle.pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'audit_log'`,
  );
  const found: Record<string, number> = {};
  for (const { table_name } of tables) {
    const { rows } = await handle.pool.query<{ n: number }>(
      `select count(*)::int as n from "${table_name}" t where t::text ilike any($1::text[])`,
      [needles.map((needle) => `%${needle}%`)],
    );
    if ((rows[0]?.n ?? 0) > 0) found[table_name] = rows[0]?.n ?? 0;
  }
  return found;
}

const rowsOf = async (table: string, organizationId: string): Promise<number> =>
  (await handle.pool.query<{ n: number }>(`select count(*)::int as n from "${table}" where organization_id = $1`, [organizationId])).rows[0]?.n ?? 0;

beforeAll(async () => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

describe('erasure on Postgres', () => {
  it('after eraseCandidate NO table mentions the candidate, the applications, the email or the name, except audit_log (ids only)', async () => {
    const world = await buildWorld();
    const needles = [world.candidateId, ...world.applicationIds, world.person.email, world.person.firstName, world.person.lastName, world.person.phone];
    const before = await leftovers(needles);
    expect(Object.keys(before).length).toBeGreaterThan(8);
    expect(Object.keys(before)).toEqual(expect.arrayContaining(['feedback_request', 'interview_feedback', 'application_stage_event', 'response_promise']));

    const deps = depsFor(world);
    const result = await eraseCandidate(deps, recruiter(world.org), { candidateId: world.candidateId, confirmName: fullName(world) });
    expect(result).toEqual({ erased: true, applicationCount: 2, candidateErased: true });

    // The only permitted trace outside the audit log: the `candidate.erased` webhook event, which holds the candidate id
    // (its consumers need it to erase their copy) and counts, nothing else.
    const left = await leftovers(needles);
    expect(left).toEqual({ outbox_event: 1 });
    const { rows: events } = await handle.pool.query(`select type, data from outbox_event where organization_id = $1 and data::text ilike $2`, [world.org, `%${world.candidateId}%`]);
    expect(events).toEqual([{ type: 'candidate.erased', data: { candidateId: world.candidateId, applicationCount: 2, candidateErased: true } }]);

    const { rows: audit } = await handle.pool.query<{ action: string; target_id: string; metadata: unknown }>(
      `select action, target_id, metadata from audit_log where organization_id = $1 and action = 'candidate.erased'`,
      [world.org],
    );
    expect(audit).toEqual([{ action: 'candidate.erased', target_id: world.candidateId, metadata: { reason: 'request', applicationCount: 2 } }]);
    const { rows: auditPii } = await handle.pool.query(`select 1 from audit_log a where a::text ilike any($1::text[])`, [[world.person.email, world.person.firstName, world.person.lastName].map((v) => `%${v}%`)]);
    expect(auditPii).toEqual([]);
    expect(await rowsOf('webhook_delivery', world.org)).toBe(1);
    expect([...world.files.keys()]).toEqual([`organizations/${world.org}/applications/${world.otherApplicationId}/cv`]);
  });

  it('leaves the other candidate of the organization and everything of their application untouched', async () => {
    const world = await buildWorld();
    await eraseCandidate(depsFor(world), recruiter(world.org), { candidateId: world.candidateId, confirmName: fullName(world) });
    const left = await leftovers([world.otherCandidateId, world.otherApplicationId, world.bystander.email, world.bystander.lastName]);
    for (const table of ['candidate', 'application', 'candidate_note', 'cv_extraction', 'conversation', 'message', 'task', 'notification', 'outbox_event', 'feedback_request', 'interview_feedback']) {
      expect(left[table] ?? 0, table).toBeGreaterThan(0);
    }
    expect(await rowsOf('webhook_delivery', world.org)).toBe(1);
  });

  it('erases one application and keeps the candidate, then the candidate with the last one', async () => {
    const world = await buildWorld();
    const [first, second] = world.applicationIds as [string, string];
    const deps = depsFor(world);
    expect(await eraseApplication(deps, recruiter(world.org), { applicationId: first, confirmName: fullName(world) })).toEqual({ erased: true, applicationCount: 1, candidateErased: false });
    expect(Object.keys(await leftovers([first]))).toEqual([]);
    expect((await leftovers([world.candidateId])).candidate).toBe(1);
    expect(await eraseApplication(deps, recruiter(world.org), { applicationId: second, confirmName: fullName(world) })).toMatchObject({ candidateErased: true });
    expect((await leftovers([world.candidateId])).candidate).toBeUndefined();
  });

  it('is refused for another organization and deletes nothing', async () => {
    const world = await buildWorld();
    const intruder = await insertOrg();
    await expect(eraseCandidate(depsFor(world), recruiter(intruder), { candidateId: world.candidateId, confirmName: fullName(world) })).rejects.toThrow('Candidate not found');
    expect((await leftovers([world.candidateId])).candidate).toBe(1);
  });

  it('is one transaction: a failing audit append leaves every row in place', async () => {
    const world = await buildWorld();
    const real = createDrizzleErasure(handle.db);
    const failing = { run: <T,>(work: Parameters<typeof real.run<T>>[0]) => real.run((r) => work({ ...r, auditLog: { ...r.auditLog, append: async () => Promise.reject(new Error('audit down')) } })) };
    await expect(eraseCandidate(depsFor(world, { erasure: failing }), recruiter(world.org), { candidateId: world.candidateId, confirmName: fullName(world) })).rejects.toThrow('audit down');
    const left = await leftovers([world.candidateId, ...world.applicationIds]);
    expect(left.candidate).toBe(1);
    expect(left.application).toBe(2);
    expect(left.message).toBeGreaterThan(0);
    expect(world.files.keys()).toHaveLength(3);
  });
});

describe('Postgres adapters of the privacy ports', () => {
  it('candidate save refuses an email of another candidate with a conflict', async () => {
    const world = await buildWorld();
    const candidates = createDrizzleCandidates(handle.db);
    const person = await candidates.findById(world.org, world.candidateId);
    await expect(candidates.save({ ...person!, email: world.bystander.email.toUpperCase() })).rejects.toBeInstanceOf(ConflictError);
  });

  it('lists applications by retention expiry, per organization and across organizations', async () => {
    const world = await buildWorld();
    const applications = createDrizzleApplications(handle.db);
    const [first] = world.applicationIds as [string];
    const current = (await applications.findById(world.org, first))!;
    await applications.update(current.organizationId, current.id, { retentionExpiresAt: new Date('2020-01-01T00:00:00Z') });
    const mine = await applications.listRetentionExpiringBefore(world.org, new Date('2021-01-01T00:00:00Z'));
    expect(mine.map((a) => a.id)).toEqual([first]);
    expect(await applications.listRetentionExpiringBefore(await insertOrg(), new Date('2099-01-01T00:00:00Z'))).toEqual([]);
    expect((await applications.listRetentionExpiringAcrossOrganizations(new Date('2021-01-01T00:00:00Z'))).map((a) => a.id)).toContain(first);
    await applications.update(current.organizationId, current.id, { retentionExpiresAt: current.retentionExpiresAt });
  });

  it('pages the retention scan with a keyset cursor and a limit', async () => {
    const world = await buildWorld();
    const applications = createDrizzleApplications(handle.db);
    const ids = world.applicationIds as readonly string[];
    for (const id of ids) await applications.update(world.org, id, { retentionExpiresAt: new Date('2020-01-01T00:00:00Z') });
    const before = new Date('2021-01-01T00:00:00Z');
    const all = await applications.listRetentionExpiringBefore(world.org, before);
    expect(all.length).toBe(ids.length);
    const seen: string[] = [];
    let after: { retentionExpiresAt: Date; id: string } | undefined;
    for (;;) {
      const batch = await applications.listRetentionExpiringBefore(world.org, before, { limit: 1, after });
      if (batch.length === 0) break;
      expect(batch).toHaveLength(1);
      const last = batch[batch.length - 1]!;
      seen.push(last.id);
      after = { retentionExpiresAt: last.retentionExpiresAt, id: last.id };
    }
    expect(seen).toEqual(all.map((a) => a.id));
  });

  it('stores retention runs and data exports, isolated per organization', async () => {
    const org = await insertOrg();
    const other = await insertOrg();
    const runs = createDrizzleRetentionRuns(handle.db);
    await runs.create({ id: randomUUID(), organizationId: org, startedAt: new Date('2026-01-01T00:00:00Z'), warned: 2, erased: 1 });
    const latest = await runs.create({ id: randomUUID(), organizationId: org, startedAt: new Date('2026-02-01T00:00:00Z'), warned: 0, erased: 3 });
    expect((await runs.listRecent(org, 5))[0]).toEqual(latest);
    expect(await runs.listRecent(org, 1)).toHaveLength(1);
    expect(await runs.listRecent(other, 5)).toEqual([]);

    const exports = createDrizzleDataExports(handle.db);
    const id = randomUUID();
    const created = await exports.create({ id, organizationId: org, requestedBy: 'u', status: 'pending', sizeBytes: null, createdAt: NOW, completedAt: null, expiresAt: new Date('2026-06-08T00:00:00Z') });
    expect(await exports.findById(org, id)).toEqual(created);
    expect(await exports.findById(other, id)).toBeNull();
    const ready = await exports.save({ ...created, status: 'ready', sizeBytes: 1234, completedAt: NOW });
    expect((await exports.list(org))[0]).toEqual(ready);
    expect((await exports.listExpiredAcrossOrganizations(new Date('2026-07-01T00:00:00Z'))).map((e) => e.id)).toContain(id);
    expect((await exports.listExpiredAcrossOrganizations(new Date('2026-06-02T00:00:00Z'))).map((e) => e.id)).not.toContain(id);
    expect(await exports.delete(other, id)).toBe(false);
    expect(await exports.delete(org, id)).toBe(true);
    await expect(exports.save({ ...ready, id: randomUUID() })).rejects.toThrow('not found');
  });

  it('runs the retention job on real data: expired applications and their candidate disappear, with a run summary', async () => {
    const world = await buildWorld();
    const applications = createDrizzleApplications(handle.db);
    for (const id of world.applicationIds) {
      const current = (await applications.findById(world.org, id))!;
      await applications.update(current.organizationId, current.id, { retentionExpiresAt: new Date('2000-01-01T00:00:00Z') });
    }
    const base = depsFor(world);
    const notifications = createDrizzleNotifications(handle.db);
    const result = await runRetention(
      { ...base, notifications, members: createDrizzleMemberDirectory(handle.db), retentionRuns: createDrizzleRetentionRuns(handle.db), dataExports: createDrizzleDataExports(handle.db) },
      { now: NOW },
    );
    const mine = result.runs.find((run) => run.organizationId === world.org);
    expect(mine).toMatchObject({ erased: 2 });
    expect(result.failures).toEqual([]);
    const left = await leftovers([world.candidateId, ...world.applicationIds, world.person.email, world.person.lastName]);
    expect(Object.keys(left)).toEqual(['outbox_event']);
    const { rows } = await handle.pool.query(`select metadata from audit_log where organization_id = $1 and action = 'candidate.erased'`, [world.org]);
    expect(rows).toEqual([{ metadata: { reason: 'retention', applicationCount: 2 } }]);
  });
});
