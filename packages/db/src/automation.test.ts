import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, runMigrations, type DbHandle } from './index.js';
import {
  application,
  automationRule,
  candidate,
  job,
  message,
  notification,
  organization,
  outboxEvent,
  task,
  webhookDelivery,
  webhookEndpoint,
} from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');

interface World {
  readonly org: string;
  readonly jobId: string;
  readonly applicationId: string;
  readonly candidateId: string;
}

async function insertWorld(responseDays?: number): Promise<World> {
  const org = randomUUID();
  await handle.db.insert(organization).values({ id: org, name: org, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  const content = (responseDays === undefined ? {} : { responseDays }) as never;
  await handle.db.insert(job).values({ id: jobId, organizationId: org, slug: jobId, title: 'T', content, createdBy: 'u' });
  const candidateId = randomUUID();
  await handle.db
    .insert(candidate)
    .values({ id: candidateId, organizationId: org, firstName: 'Ada', lastName: 'L', email: `${candidateId}@x.it`, retentionExpiresAt: NOW });
  const applicationId = randomUUID();
  await handle.db.insert(application).values({
    id: applicationId,
    organizationId: org,
    jobId,
    candidateId,
    stageId: 'received',
    cvKey: 'k',
    cvFileName: 'cv.pdf',
    cvMediaType: 'application/pdf',
    cvSizeBytes: 1,
    consent: { privacyNoticeId: 'n', privacyNoticeVersion: 1, scopes: ['selection'], givenAt: NOW } as never,
    retentionExpiresAt: NOW,
    source: 'careers_page',
    stageChangedAt: NOW,
  });
  return { org, jobId, applicationId, candidateId };
}

const notify = (world: World, overrides: Partial<typeof notification.$inferInsert> = {}) =>
  handle.db.insert(notification).values({
    id: randomUUID(),
    organizationId: world.org,
    userId: 'user_1',
    kind: 'response_overdue',
    applicationId: world.applicationId,
    dedupeKey: `response_overdue:${world.applicationId}:received`,
    ...overrides,
  });

/** The data statements of the migration: everything after the DDL, split like the migrator does. */
const backfillStatements = (): string[] =>
  readFileSync(new URL('../drizzle/0007_automations_deadlines.sql', import.meta.url), 'utf8')
    .split('--> statement-breakpoint')
    .filter((statement) => statement.includes('UPDATE "application"'));

describe('automation and deadline tables', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('creates the tables', async () => {
    const { rows } = await handle.pool.query(`select table_name from information_schema.tables where table_schema = 'public'`);
    const names = rows.map((r: { table_name: string }) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining(['notification', 'task', 'automation_rule', 'webhook_endpoint', 'webhook_delivery', 'outbox_event']),
    );
  });

  it('adds nullable response columns to application', async () => {
    const world = await insertWorld();
    const [row] = await handle.db.select().from(application).where(eq(application.id, world.applicationId));
    expect(row).toMatchObject({ responseDueAt: null, respondedAt: null });
  });

  it('dedupes notifications per (organization, user, key) and lets other users and organizations through', async () => {
    const world = await insertWorld();
    await notify(world);
    await expect(notify(world)).rejects.toThrow();
    await expect(notify(world, { userId: 'user_2' })).resolves.toBeDefined();
    await expect(notify(world, { dedupeKey: `response_overdue:${world.applicationId}:stage-1` })).resolves.toBeDefined();
    const [row] = await handle.db.select().from(notification).where(eq(notification.userId, 'user_2'));
    expect(row).toMatchObject({ readAt: null, payload: {}, taskId: null });
  });

  it('stores tasks with optional links and refuses to delete a job or application that has tasks', async () => {
    const world = await insertWorld();
    await handle.db.insert(task).values({ id: randomUUID(), organizationId: world.org, title: 'Call', assigneeId: 'u', createdBy: 'u' });
    await handle.db
      .insert(task)
      .values({ id: randomUUID(), organizationId: world.org, applicationId: world.applicationId, jobId: world.jobId, title: 'x', assigneeId: 'u', createdBy: 'u' });
    await expect(handle.pool.query('delete from application where id = $1', [world.applicationId])).rejects.toThrow();
  });

  it('stores automation rules with their config', async () => {
    const world = await insertWorld();
    await handle.db.insert(automationRule).values({
      id: randomUUID(),
      organizationId: world.org,
      jobId: world.jobId,
      stageId: 'received',
      action: 'create_task',
      config: { title: 'T', assignee: 'job_owner' },
      createdBy: 'u',
    });
    const [row] = await handle.db.select().from(automationRule).where(eq(automationRule.organizationId, world.org));
    expect(row).toMatchObject({ enabled: true, config: { title: 'T', assignee: 'job_owner' } });
  });

  it('removes the delivery log with its endpoint', async () => {
    const world = await insertWorld();
    const endpointId = randomUUID();
    await handle.db
      .insert(webhookEndpoint)
      .values({ id: endpointId, organizationId: world.org, url: 'https://x.io', secret: 'whsec_x', events: ['job.closed'] });
    await handle.db
      .insert(webhookDelivery)
      .values({ id: randomUUID(), organizationId: world.org, endpointId, eventId: 'e', eventType: 'job.closed', status: 'failed', attempt: 1 });
    await handle.db.delete(webhookEndpoint).where(eq(webhookEndpoint.id, endpointId));
    expect(await handle.db.select().from(webhookDelivery).where(eq(webhookDelivery.endpointId, endpointId))).toHaveLength(0);
  });

  it('keeps outbox events unpublished until marked', async () => {
    const world = await insertWorld();
    await handle.db.insert(outboxEvent).values({ id: randomUUID(), organizationId: world.org, type: 'job.closed', data: { jobId: 'j' }, occurredAt: NOW });
    const [row] = await handle.db.select().from(outboxEvent).where(eq(outboxEvent.organizationId, world.org));
    expect(row?.publishedAt).toBeNull();
  });

  it('backfills the deadline of open applications from the stage change and the job, and the answered ones', async () => {
    const withDays = await insertWorld(5);
    const withoutDays = await insertWorld();
    const decided = await insertWorld(5);
    const answered = await insertWorld(5);
    await handle.db
      .update(application)
      .set({ outcome: 'not_selected', closedAt: new Date('2026-06-03T00:00:00Z') })
      .where(eq(application.id, decided.applicationId));
    await handle.db.insert(message).values({
      id: randomUUID(),
      organizationId: answered.org,
      applicationId: answered.applicationId,
      candidateId: answered.candidateId,
      direction: 'outbound',
      subject: 's',
      bodyText: 'b',
      status: 'sent',
      sentBy: 'user_1',
      sentAt: new Date('2026-06-02T00:00:00Z'),
    });
    for (const statement of backfillStatements()) await handle.pool.query(statement);
    const read = async (world: World) =>
      (await handle.db.select().from(application).where(eq(application.id, world.applicationId)))[0];
    expect((await read(withDays))?.responseDueAt).toEqual(new Date('2026-06-06T00:00:00Z'));
    expect((await read(withoutDays))?.responseDueAt).toBeNull();
    expect(await read(decided)).toMatchObject({ respondedAt: new Date('2026-06-03T00:00:00Z') });
    expect(await read(answered)).toMatchObject({ responseDueAt: null, respondedAt: new Date('2026-06-02T00:00:00Z') });
  });
});
