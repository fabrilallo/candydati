import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildApplication,
  buildAutomationRule,
  buildCandidate,
  buildJob,
  buildNotification,
  buildOutboxEvent,
  buildTask,
  buildWebhookDelivery,
  buildWebhookEndpoint,
  fakePdfBytes,
  completeJobContent,
  createInMemoryFileStorage,
  createInMemoryTaskQueue,
  fakeCvSniffer,
  buildPrivacyNotice,
  validApplicationForm,
} from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleApplicationIntake } from './drizzle-application-intake.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleAutomationExecutions, createDrizzleAutomationRules } from './drizzle-automation-rules.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleMemberDirectory } from './drizzle-members.js';
import { createDrizzleNotifications } from './drizzle-notifications.js';
import { createDrizzleOrganizationDirectory } from './drizzle-organizations.js';
import { createDrizzleOutbox } from './drizzle-outbox.js';
import { createDrizzlePrivacyNotices } from './drizzle-privacy-notices.js';
import { createDrizzleTasks } from './drizzle-tasks.js';
import { createDrizzleWebhookDeliveries, createDrizzleWebhookEndpoints } from './drizzle-webhooks.js';
import { submitApplication } from '../use-cases/candidates/submit-application.js';

let handle: DbHandle;
const D = (iso: string) => new Date(iso);

interface World {
  readonly org: string;
  readonly jobId: string;
  readonly candidateId: string;
  readonly applicationId: string;
}

async function insertWorld(applicationOverrides = {}): Promise<World> {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const job = buildJob({ id: randomUUID(), slug: randomUUID(), organizationId: org, status: 'published', publishedAt: new Date() });
  await createDrizzleJobs(handle.db).create(job);
  const candidate = buildCandidate({ id: randomUUID(), organizationId: org, email: `${randomUUID()}@x.it` });
  await createDrizzleCandidates(handle.db).create(candidate);
  const application = buildApplication({ id: randomUUID(), organizationId: org, jobId: job.id, candidateId: candidate.id, ...applicationOverrides });
  await createDrizzleApplications(handle.db).create(application);
  return { org, jobId: job.id, candidateId: candidate.id, applicationId: application.id };
}

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

describe('applications: response columns and awaiting queries', () => {
  it('stores the deadline and the answer, and lists open unanswered applications up to a date, per organization', async () => {
    const a = await insertWorld({ responseDueAt: D('2026-06-02T00:00:00Z') });
    const b = await insertWorld({ responseDueAt: D('2026-06-01T00:00:00Z') });
    const repo = createDrizzleApplications(handle.db);
    const stored = await repo.findById(a.org, a.applicationId);
    expect(stored).toMatchObject({ responseDueAt: D('2026-06-02T00:00:00Z'), respondedAt: null });
    expect((await repo.listAwaitingResponse(a.org, D('2026-06-03T00:00:00Z'))).map((x) => x.id)).toEqual([a.applicationId]);
    expect(await repo.listAwaitingResponse(a.org, D('2026-06-01T00:00:00Z'))).toEqual([]);
    const all = (await repo.listAwaitingResponseAcrossOrganizations(D('2026-06-03T00:00:00Z'))).map((x) => x.id);
    expect(all).toEqual(expect.arrayContaining([a.applicationId, b.applicationId]));
    expect(all.indexOf(b.applicationId)).toBeLessThan(all.indexOf(a.applicationId));
    if (!stored) throw new Error('missing');
    await repo.transition(a.org, stored.id, { stageId: stored.stageId }, { respondedAt: D('2026-06-01T12:00:00Z'), responseDueAt: null });
    expect(await repo.listAwaitingResponse(a.org, D('2030-01-01T00:00:00Z'))).toEqual([]);
    await repo.transition(a.org, stored.id, {}, { outcome: 'hired', closedAt: new Date(), respondedAt: null });
    expect(await repo.listAwaitingResponse(a.org, D('2030-01-01T00:00:00Z'))).toEqual([]);
  });
});

describe('createDrizzleNotifications', () => {
  it('dedupes per user and key, lists newest first, counts and marks read for the user only', async () => {
    const w = await insertWorld();
    const repo = createDrizzleNotifications(handle.db);
    const make = (overrides = {}) =>
      buildNotification({ id: randomUUID(), organizationId: w.org, applicationId: w.applicationId, jobId: w.jobId, ...overrides });
    const first = make({ createdAt: D('2026-05-01T00:00:00Z'), payload: { escalated: false } });
    expect(await repo.createIfAbsent(first, 'k1')).toEqual(first);
    expect(await repo.createIfAbsent(make(), 'k1')).toBeNull();
    expect(await repo.createIfAbsent(make({ userId: 'other' }), 'k1')).not.toBeNull();
    const second = make({ createdAt: D('2026-05-02T00:00:00Z') });
    await repo.createIfAbsent(second, 'k2');
    const page = await repo.list({ organizationId: w.org, userId: 'user_test', unreadOnly: false, page: 1, limit: 10 });
    expect(page.items.map((n) => n.id)).toEqual([second.id, first.id]);
    expect(page.total).toBe(2);
    expect((await repo.list({ organizationId: w.org, userId: 'user_test', unreadOnly: false, page: 2, limit: 1 })).items.map((n) => n.id)).toEqual([first.id]);
    expect(await repo.unreadCount(w.org, 'user_test')).toBe(2);
    expect(await repo.markRead(w.org, 'user_test', [first.id], D('2026-06-01T00:00:00Z'))).toBe(1);
    expect(await repo.markRead(w.org, 'user_test', [first.id], D('2026-06-01T00:00:00Z'))).toBe(0);
    expect(await repo.markRead(w.org, 'user_test', [], D('2026-06-01T00:00:00Z'))).toBe(0);
    expect((await repo.list({ organizationId: w.org, userId: 'user_test', unreadOnly: true, page: 1, limit: 10 })).items.map((n) => n.id)).toEqual([second.id]);
    expect(await repo.markRead(w.org, 'nobody', undefined, new Date())).toBe(0);
    expect(await repo.markRead(w.org, 'user_test', undefined, new Date())).toBe(1);
    expect(await repo.unreadCount(w.org, 'user_test')).toBe(0);
    expect(await repo.unreadCount(w.org, 'other')).toBe(1);
  });
});

describe('createDrizzleTasks', () => {
  it('creates, saves, finds, orders and isolates', async () => {
    const w = await insertWorld();
    const other = await insertWorld();
    const repo = createDrizzleTasks(handle.db);
    const make = (overrides = {}) => buildTask({ id: randomUUID(), organizationId: w.org, applicationId: w.applicationId, jobId: w.jobId, ...overrides });
    const late = make({ dueAt: D('2026-06-09T00:00:00Z') });
    const soon = make({ dueAt: D('2026-06-02T00:00:00Z') });
    const none = make();
    const done = make({ completedAt: D('2026-05-01T00:00:00Z') });
    const theirs = make({ assigneeId: 'someone', applicationId: null });
    for (const task of [late, soon, none, done, theirs]) expect(await repo.create(task)).toEqual(task);
    expect((await repo.list({ organizationId: w.org, assigneeId: 'user_test', openOnly: true, limit: 10 })).map((t) => t.id)).toEqual([soon.id, late.id, none.id]);
    expect((await repo.list({ organizationId: w.org, assigneeId: 'user_test', openOnly: false, limit: 10 })).map((t) => t.id)).toEqual([soon.id, late.id, none.id, done.id]);
    expect((await repo.list({ organizationId: w.org, openOnly: true, limit: 2 }))).toHaveLength(2);
    expect((await repo.listByApplication(w.org, w.applicationId)).map((t) => t.id)).toEqual([soon.id, late.id, none.id, done.id]);
    expect(await repo.list({ organizationId: other.org, openOnly: false, limit: 10 })).toEqual([]);
    const reopened = { ...done, completedAt: null };
    expect(await repo.save(reopened)).toEqual(reopened);
    expect(await repo.findById(w.org, done.id)).toEqual(reopened);
    expect(await repo.findById(other.org, done.id)).toBeNull();
    await expect(repo.save({ ...done, organizationId: other.org })).rejects.toThrow();
    const due = (await repo.listOpenDueAcrossOrganizations(D('2026-06-03T00:00:00Z'))).map((t) => t.id);
    expect(due).toContain(soon.id);
    expect(due).not.toContain(late.id);
  });
});

describe('createDrizzleAutomationRules', () => {
  it('stores the action without its type in config and parses it back', async () => {
    const w = await insertWorld();
    const other = await insertWorld();
    const repo = createDrizzleAutomationRules(handle.db);
    const make = (overrides = {}) => buildAutomationRule({ id: randomUUID(), organizationId: w.org, jobId: w.jobId, ...overrides });
    const task = make({ createdAt: D('2026-01-01T00:00:00Z'), action: { type: 'create_task', title: 'T', assignee: 'job_owner', dueInDays: 2 } });
    const send = make({ stageId: 'received', createdAt: D('2026-01-02T00:00:00Z'), action: { type: 'send_template', templateId: 'default:receipt' } });
    const off = make({ enabled: false, createdAt: D('2026-01-03T00:00:00Z') });
    for (const rule of [task, send, off]) expect(await repo.create(rule)).toEqual(rule);
    const { rows } = await handle.pool.query('select action, config from automation_rule where id = $1', [task.id]);
    expect(rows[0]).toEqual({ action: 'create_task', config: { title: 'T', assignee: 'job_owner', dueInDays: 2 } });
    expect((await repo.listByJob(w.org, w.jobId)).map((r) => r.id)).toEqual([task.id, send.id, off.id]);
    expect((await repo.listEnabledByStage(w.org, w.jobId, 'stage-0')).map((r) => r.id)).toEqual([task.id]);
    expect(await repo.listByJob(other.org, w.jobId)).toEqual([]);
    const moved = { ...task, stageId: 'stage-1', enabled: false };
    expect(await repo.save(moved)).toEqual(moved);
    expect(await repo.findById(w.org, task.id)).toEqual(moved);
    expect(await repo.findById(other.org, task.id)).toBeNull();
    await expect(repo.save({ ...task, organizationId: other.org })).rejects.toThrow();
    expect(await repo.deleteByStages(w.org, w.jobId, [])).toBe(0);
    expect(await repo.deleteByStages(other.org, w.jobId, ['received'])).toBe(0);
    expect(await repo.deleteByStages(w.org, w.jobId, ['received', 'stage-1'])).toBe(2);
    expect(await repo.delete(other.org, off.id)).toBe(false);
    expect(await repo.delete(w.org, off.id)).toBe(true);
    expect(await repo.delete(w.org, off.id)).toBe(false);
  });

  it('claims a rule run once per stage entry, even for two transactions at the same time (#13)', async () => {
    const w = await insertWorld();
    const rule = buildAutomationRule({ id: randomUUID(), organizationId: w.org, jobId: w.jobId });
    await createDrizzleAutomationRules(handle.db).create(rule);
    const entry = (stageEnteredAt: Date) => ({
      id: randomUUID(),
      organizationId: w.org,
      ruleId: rule.id,
      applicationId: w.applicationId,
      stageId: 'stage-0',
      stageEnteredAt,
      createdAt: new Date(),
    });
    const first = D('2026-06-01T00:00:00Z');
    const claimInTx = () => handle.db.transaction((tx) => createDrizzleAutomationExecutions(tx).claim(entry(first)));
    expect((await Promise.all([claimInTx(), claimInTx()])).toSorted()).toEqual([false, true]);
    const repo = createDrizzleAutomationExecutions(handle.db);
    expect(await repo.claim(entry(first))).toBe(false);
    // A new entry into the same stage is a new run.
    expect(await repo.claim(entry(D('2026-06-02T00:00:00Z')))).toBe(true);
    // A rolled back run leaves no claim behind.
    const again = entry(D('2026-06-03T00:00:00Z'));
    await expect(
      handle.db.transaction(async (tx) => {
        await createDrizzleAutomationExecutions(tx).claim(again);
        throw new Error('rule failed');
      }),
    ).rejects.toThrow('rule failed');
    expect(await repo.claim({ ...again, id: randomUUID() })).toBe(true);
  });

  it('fails loudly on a corrupted config instead of running it', async () => {
    const w = await insertWorld();
    const id = randomUUID();
    await handle.db.insert(schema.automationRule).values({ id, organizationId: w.org, jobId: w.jobId, stageId: 'received', action: 'create_task', config: { title: '' }, createdBy: 'u' });
    await expect(createDrizzleAutomationRules(handle.db).findById(w.org, id)).rejects.toThrow();
  });
});

describe('outbox, webhook endpoints and deliveries', () => {
  it('keeps events until published and fans out to enabled subscribed endpoints of the same organization', async () => {
    const a = await insertWorld();
    const b = await insertWorld();
    const outbox = createDrizzleOutbox(handle.db);
    const event = buildOutboxEvent({ id: randomUUID(), organizationId: a.org, occurredAt: D('2026-01-01T00:00:00Z') });
    const later = buildOutboxEvent({ id: randomUUID(), organizationId: b.org, occurredAt: D('2026-01-02T00:00:00Z') });
    expect(await outbox.append(event)).toEqual(event);
    await outbox.append(later);
    const pending = (await outbox.listUnpublished(1000, new Date())).map((e) => e.id);
    expect(pending.indexOf(event.id)).toBeLessThan(pending.indexOf(later.id));
    expect(await outbox.listUnpublished(1, new Date())).toHaveLength(1);
    expect(await outbox.findById(a.org, event.id)).toEqual(event);
    expect(await outbox.findById(b.org, event.id)).toBeNull();
    await outbox.markPublished(b.org, event.id, new Date());
    expect((await outbox.listUnpublished(1000, new Date())).map((e) => e.id)).toContain(event.id);
    await outbox.markPublished(a.org, event.id, D('2026-02-01T00:00:00Z'));
    expect((await outbox.listUnpublished(1000, new Date())).map((e) => e.id)).not.toContain(event.id);
    expect((await outbox.findById(a.org, event.id))?.publishedAt).toEqual(D('2026-02-01T00:00:00Z'));
  });

  it('manages endpoints per organization and cascades their delivery log', async () => {
    const a = await insertWorld();
    const b = await insertWorld();
    const endpoints = createDrizzleWebhookEndpoints(handle.db);
    const deliveries = createDrizzleWebhookDeliveries(handle.db);
    const make = (organizationId: string, overrides = {}) => buildWebhookEndpoint({ id: randomUUID(), organizationId, ...overrides });
    const all = make(a.org, { createdAt: D('2026-01-01T00:00:00Z') });
    const closed = make(a.org, { events: ['job.closed'], createdAt: D('2026-01-02T00:00:00Z') });
    const off = make(a.org, { enabled: false });
    for (const endpoint of [all, closed, off]) expect(await endpoints.create(endpoint)).toEqual(endpoint);
    await endpoints.create(make(b.org));
    expect((await endpoints.list(a.org)).map((e) => e.id)).toHaveLength(3);
    expect((await endpoints.listForEvent(a.org, 'job.closed')).map((e) => e.id).sort()).toEqual([all.id, closed.id].sort());
    expect((await endpoints.listForEvent(a.org, 'application.moved')).map((e) => e.id)).toEqual([all.id]);
    const updated = { ...closed, url: 'https://new.example.com', events: ['job.published' as const], enabled: false };
    expect(await endpoints.save(updated)).toEqual(updated);
    expect(await endpoints.findById(a.org, closed.id)).toEqual(updated);
    expect(await endpoints.findById(b.org, closed.id)).toBeNull();
    await expect(endpoints.save({ ...closed, organizationId: b.org })).rejects.toThrow();
    const older = buildWebhookDelivery({ id: randomUUID(), organizationId: a.org, endpointId: all.id, createdAt: D('2026-01-01T00:00:00Z') });
    const newer = buildWebhookDelivery({ id: randomUUID(), organizationId: a.org, endpointId: all.id, status: 'failed', responseCode: 500, error: 'http_error', createdAt: D('2026-01-02T00:00:00Z') });
    await deliveries.append(older);
    await deliveries.append(newer);
    expect((await deliveries.listByEndpoint(a.org, all.id, 10)).map((d) => d.id)).toEqual([newer.id, older.id]);
    expect(await deliveries.listByEndpoint(b.org, all.id, 10)).toEqual([]);
    expect(await endpoints.delete(b.org, all.id)).toBe(false);
    expect(await endpoints.delete(a.org, all.id)).toBe(true);
    expect(await deliveries.listByEndpoint(a.org, all.id, 10)).toEqual([]);
    expect(await endpoints.delete(a.org, all.id)).toBe(false);
  });
});

describe('createDrizzleMemberDirectory', () => {
  it('lists the members of one organization with split roles and email', async () => {
    const a = await insertWorld();
    const b = await insertWorld();
    const uid = randomUUID();
    await handle.db.insert(schema.user).values({ id: uid, name: 'Mia', email: `${uid}@x.it`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
    await handle.db.insert(schema.member).values({ id: randomUUID(), organizationId: a.org, userId: uid, role: 'owner, admin', createdAt: new Date() });
    const directory = createDrizzleMemberDirectory(handle.db);
    expect(await directory.list(a.org)).toEqual([{ userId: uid, name: 'Mia', email: `${uid}@x.it`, roles: ['owner', 'admin'] }]);
    expect(await directory.list(b.org)).toEqual([]);
  });
});

describe('createDrizzleApplicationIntake: outbox in the same transaction', () => {
  it('writes the application.received event with the application and rolls both back together', async () => {
    const org = randomUUID();
    await handle.db.insert(schema.organization).values({ id: org, name: org, slug: org, createdAt: new Date() });
    const job = buildJob({ id: randomUUID(), slug: 'backend', organizationId: org, status: 'published', publishedAt: new Date(), content: completeJobContent() });
    await createDrizzleJobs(handle.db).create(job);
    await createDrizzlePrivacyNotices(handle.db).create(buildPrivacyNotice({ id: randomUUID(), organizationId: org }));
    const deps = {
      organizations: createDrizzleOrganizationDirectory(handle.db),
      jobs: createDrizzleJobs(handle.db),
      privacyNotices: createDrizzlePrivacyNotices(handle.db),
      intake: createDrizzleApplicationIntake(handle.db),
      files: createInMemoryFileStorage(),
      queue: createInMemoryTaskQueue(),
      cvSniffer: fakeCvSniffer,
      newId: () => randomUUID(),
      now: () => D('2026-06-01T10:00:00Z'),
    };
    const submission = { organizationSlug: org, jobSlug: 'backend', form: validApplicationForm(), cv: { bytes: fakePdfBytes(), declaredName: 'cv.pdf' } };
    await submitApplication(deps, submission);
    const { rows } = await handle.pool.query(
      `select o.type, o.data, a.response_due_at from outbox_event o join application a on a.id = o.data->>'applicationId' where o.organization_id = $1`,
      [org],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'application.received', response_due_at: D('2026-06-06T10:00:00Z') });
    const real = createDrizzleApplicationIntake(handle.db);
    const failing = { ...deps, newId: () => randomUUID(), intake: { run: <T>(work: Parameters<typeof real.run<T>>[0]) => real.run(async (repositories) => { await work(repositories); throw new Error('boom after writes'); }) } };
    await expect(submitApplication(failing, { ...submission, form: validApplicationForm({ email: 'other@example.com' }) })).rejects.toThrow('boom after writes');
    expect((await handle.pool.query('select 1 from outbox_event where organization_id = $1', [org])).rowCount).toBe(1);
  });
});
