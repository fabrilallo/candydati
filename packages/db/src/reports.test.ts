import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { application, applicationStageEvent, auditLog, candidate, job, message, organization, responsePromise } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;
const consent = { privacyNoticeId: 'n', privacyNoticeVersion: 1, scopes: ['selection'], givenAt: new Date() } as never;
const at = (iso: string): Date => new Date(`${iso}Z`);

/** The statements after the BACKFILL marker of the migration, run again over data created after the migration. */
const backfillSql = (): string => {
  const sql = readFileSync(new URL('../drizzle/0013_phase10_reports.sql', import.meta.url), 'utf8');
  return sql.slice(sql.indexOf('-- BACKFILL')).replaceAll('--> statement-breakpoint', '');
};

async function world(responseDays: number | null) {
  const org = randomUUID();
  await handle.db.insert(organization).values({ id: org, name: org, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  const content = (responseDays === null ? {} : { responseDays }) as never;
  await handle.db.insert(job).values({ id: jobId, organizationId: org, slug: jobId, title: 'T', content, createdBy: 'u' });
  const candidateId = randomUUID();
  await handle.db.insert(candidate).values({ id: candidateId, organizationId: org, firstName: 'A', lastName: 'B', email: `${candidateId}@x.it`, retentionExpiresAt: new Date() });
  return { org, jobId, candidateId };
}

type World = Awaited<ReturnType<typeof world>>;

async function addApplication(w: World, values: Partial<typeof application.$inferInsert> = {}): Promise<string> {
  const id = randomUUID();
  await handle.db.insert(application).values({
    id, organizationId: w.org, jobId: w.jobId, stageId: 'received', cvKey: 'k', cvFileName: 'cv.pdf', cvMediaType: 'application/pdf', cvSizeBytes: 1, consent, retentionExpiresAt: new Date(), source: 'careers_page', ...values,
    candidateId: w.candidateId,
  });
  return id;
}

describe('phase 10 tables and backfill', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('defaults origin to direct and refuses to delete an application with events or promises', async () => {
    const w = await world(3);
    const id = await addApplication(w);
    const [row] = await handle.db.select().from(application).where(eq(application.id, id));
    expect(row?.origin).toBe('direct');
    await handle.db.insert(applicationStageEvent).values({ id: randomUUID(), organizationId: w.org, applicationId: id, jobId: w.jobId, toStageId: 'received', occurredAt: new Date(), actorType: 'system' });
    await handle.db.insert(responsePromise).values({ id: randomUUID(), organizationId: w.org, applicationId: id, jobId: w.jobId, stageId: 'received', startedAt: new Date(), dueAt: new Date(), status: 'open' });
    await expect(handle.db.delete(application).where(eq(application.id, id))).rejects.toThrow();
    const [event] = await handle.db.select().from(applicationStageEvent).where(eq(applicationStageEvent.applicationId, id));
    const [promise] = await handle.db.select().from(responsePromise).where(eq(responsePromise.applicationId, id));
    expect(event?.backfilled).toBe(false);
    expect(promise?.backfilled).toBe(false);
  });

  it('backfills events from the audit log and the rows, and marks promises as backfilled', async () => {
    const w = await world(3);
    const moved = await addApplication(w, { stageId: 'stage-0', createdAt: at('2026-01-01T10:00:00'), stageChangedAt: at('2026-01-02T10:00:00'), source: 'manual' });
    const decided = await addApplication(w, { stageId: 'stage-0', outcome: 'hired', createdAt: at('2026-01-01T10:00:00'), stageChangedAt: at('2026-01-02T10:00:00'), closedAt: at('2026-01-10T10:00:00') });
    const noAudit = await addApplication(w, { stageId: 'stage-1', outcome: 'not_selected', createdAt: at('2026-02-01T10:00:00'), stageChangedAt: at('2026-02-03T10:00:00'), closedAt: at('2026-02-05T10:00:00'), source: 'import' });
    const audit = (applicationId: string, action: string, metadata: Record<string, unknown>, occurredAt: Date) =>
      handle.db.insert(auditLog).values({ id: randomUUID(), organizationId: w.org, actorType: 'user', actorId: 'u', action, targetType: 'application', targetId: applicationId, metadata, occurredAt });
    await audit(moved, 'application.moved', { from: 'received', to: 'stage-0' }, at('2026-01-02T10:00:00'));
    await audit(decided, 'application.moved', { from: 'received', to: 'stage-0' }, at('2026-01-02T10:00:00'));
    await audit(decided, 'application.decided', { outcome: 'hired' }, at('2026-01-10T10:00:00'));
    // A person's reply 2 days after entering stage-0 of `moved`; the system receipt does not count.
    const msg = (sentBy: string, sentAt: string) =>
      handle.db.insert(message).values({ id: randomUUID(), organizationId: w.org, applicationId: moved, candidateId: w.candidateId, direction: 'outbound', subject: 's', bodyText: 'b', status: 'sent', sentBy, createdAt: at(sentAt), sentAt: at(sentAt) });
    await msg('system', '2026-01-02T11:00:00');
    await msg('user_x', '2026-01-04T10:00:00');

    await handle.pool.query(backfillSql());

    const events = async (id: string) =>
      (await handle.db.select().from(applicationStageEvent).where(eq(applicationStageEvent.applicationId, id))).toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const shape = (rows: Awaited<ReturnType<typeof events>>) => rows.map((r) => [r.fromStageId, r.toStageId, r.outcome, r.occurredAt.toISOString(), r.backfilled]);
    expect(shape(await events(moved))).toEqual([
      [null, 'received', null, '2026-01-01T10:00:00.000Z', true],
      ['received', 'stage-0', null, '2026-01-02T10:00:00.000Z', true],
    ]);
    expect(shape(await events(decided))).toEqual([
      [null, 'received', null, '2026-01-01T10:00:00.000Z', true],
      ['received', 'stage-0', null, '2026-01-02T10:00:00.000Z', true],
      [null, null, 'hired', '2026-01-10T10:00:00.000Z', true],
    ]);
    // An imported application has no intake event; with no audit trail the current stage and the outcome come from the row.
    expect(shape(await events(noAudit))).toEqual([
      [null, 'stage-1', null, '2026-02-03T10:00:00.000Z', true],
      [null, null, 'not_selected', '2026-02-05T10:00:00.000Z', true],
    ]);

    const promises = async (id: string) =>
      (await handle.db.select().from(responsePromise).where(eq(responsePromise.applicationId, id))).toSorted((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    expect((await promises(moved)).map((p) => [p.stageId, p.status, p.respondedAt?.toISOString() ?? null, p.dueAt.toISOString(), p.backfilled])).toEqual([
      ['received', 'kept', '2026-01-02T10:00:00.000Z', '2026-01-04T10:00:00.000Z', true],
      // stage-0: due 2026-01-05T10:00, answered 2026-01-04T10:00 by a person.
      ['stage-0', 'kept', '2026-01-04T10:00:00.000Z', '2026-01-05T10:00:00.000Z', true],
    ]);
    // `decided` stage-0 started 01-02, due 01-05, decided 01-10: answered late.
    const decidedPromises = await promises(decided);
    expect(decidedPromises.map((p) => [p.stageId, p.status])).toEqual([['received', 'kept'], ['stage-0', 'missed']]);

    const origins = await Promise.all([noAudit, moved, decided].map(async (id) => (await handle.db.select({ origin: application.origin }).from(application).where(eq(application.id, id)))[0]?.origin));
    expect(origins).toEqual(['import', 'manual', 'direct']);
  });

  it('does not create promises for jobs without a declared response time', async () => {
    const w = await world(null);
    const id = await addApplication(w);
    await handle.pool.query(backfillSql());
    expect(await handle.db.select().from(responsePromise).where(eq(responsePromise.applicationId, id))).toEqual([]);
    expect((await handle.db.select().from(applicationStageEvent).where(eq(applicationStageEvent.applicationId, id))).length).toBe(1);
  });
});
