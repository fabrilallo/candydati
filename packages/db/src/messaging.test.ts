import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { application, candidate, conversation, emailSettings, emailTemplate, job, message, organization } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');

interface World {
  readonly org: string;
  readonly applicationId: string;
  readonly candidateId: string;
}

async function insertWorld(): Promise<World> {
  const org = randomUUID();
  await handle.db.insert(organization).values({ id: org, name: org, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  await handle.db.insert(job).values({ id: jobId, organizationId: org, slug: jobId, title: 'T', content: {} as never, createdBy: 'u' });
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
  });
  return { org, applicationId, candidateId };
}

const insertMessage = (world: World, overrides: Partial<typeof message.$inferInsert> = {}) =>
  handle.db.insert(message).values({
    id: randomUUID(),
    organizationId: world.org,
    applicationId: world.applicationId,
    candidateId: world.candidateId,
    direction: 'outbound',
    subject: 's',
    bodyText: 'b',
    status: 'queued',
    ...overrides,
  });

describe('messaging tables', () => {
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
    expect(names).toEqual(expect.arrayContaining(['email_settings', 'email_template', 'conversation', 'message']));
  });

  it('keeps one settings row per organization, with defaults', async () => {
    const { org } = await insertWorld();
    await handle.db.insert(emailSettings).values({ organizationId: org, senderName: 'Acme' });
    const [row] = await handle.db.select().from(emailSettings).where(eq(emailSettings.organizationId, org));
    expect(row).toMatchObject({ fromAddress: null, domain: null, domainStatus: null, domainRecords: [] });
    await expect(handle.db.insert(emailSettings).values({ organizationId: org, senderName: 'B' })).rejects.toThrow();
  });

  it('allows one template per non-custom kind and organization, and many custom ones', async () => {
    const a = (await insertWorld()).org;
    const b = (await insertWorld()).org;
    const template = (organizationId: string, kind: 'receipt' | 'custom') =>
      handle.db.insert(emailTemplate).values({ id: randomUUID(), organizationId, kind, name: 'n', subject: 's', body: 'b' });
    await template(a, 'receipt');
    await expect(template(a, 'receipt')).rejects.toThrow();
    await expect(template(b, 'receipt')).resolves.toBeDefined();
    await template(a, 'custom');
    await expect(template(a, 'custom')).resolves.toBeDefined();
  });

  it('has one conversation per application and a unique token', async () => {
    const world = await insertWorld();
    await handle.db.insert(conversation).values({ applicationId: world.applicationId, organizationId: world.org, token: 'a'.repeat(24) });
    await expect(
      handle.db.insert(conversation).values({ applicationId: world.applicationId, organizationId: world.org, token: 'b'.repeat(24) }),
    ).rejects.toThrow();
    const other = await insertWorld();
    await expect(
      handle.db.insert(conversation).values({ applicationId: other.applicationId, organizationId: other.org, token: 'a'.repeat(24) }),
    ).rejects.toThrow();
  });

  it('applies message defaults and dedupes inbound ids per organization only', async () => {
    const world = await insertWorld();
    await insertMessage(world);
    await insertMessage(world);
    const [row] = await handle.db.select().from(message).where(eq(message.organizationId, world.org));
    expect(row).toMatchObject({ unverifiedSender: false, sentBy: null, sentAt: null, rawText: null, inboundMessageId: null });
    await insertMessage(world, { direction: 'inbound', status: 'received', inboundMessageId: '<m1@x>' });
    await expect(insertMessage(world, { direction: 'inbound', status: 'received', inboundMessageId: '<m1@x>' })).rejects.toThrow();
    const other = await insertWorld();
    await expect(insertMessage(other, { direction: 'inbound', status: 'received', inboundMessageId: '<m1@x>' })).resolves.toBeDefined();
  });

  it('refuses to delete an organization, application or candidate that has messages', async () => {
    const world = await insertWorld();
    await insertMessage(world);
    await handle.db.insert(conversation).values({ applicationId: world.applicationId, organizationId: world.org, token: 'c'.repeat(24) });
    for (const [table, id] of [['application', world.applicationId], ['candidate', world.candidateId], ['organization', world.org]] as const) {
      await expect(handle.pool.query(`delete from ${table} where id = $1`, [id])).rejects.toThrow();
    }
  });
});
