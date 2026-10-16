import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import {
  buildApplication,
  buildCandidate,
  buildEmailSettings,
  buildEmailTemplate,
  buildJob,
  buildMessage,
  createFakeEmailSender,
  createInMemoryTaskQueue,
  createTokenGenerator,
  fakePdfBytes,
  testMessagingConfig,
  validApplicationForm,
  buildPrivacyNotice,
  createInMemoryFileStorage,
  fakeCvSniffer,
} from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { submitApplication } from '../use-cases/candidates/submit-application.js';
import { deliverMessage } from '../use-cases/messaging/deliver-message.js';
import { receiveInboundEmail } from '../use-cases/messaging/receive-inbound-email.js';
import { systemActor } from '../testing/actors.js';
import { createDrizzleApplicationIntake } from './drizzle-application-intake.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleAuditLog } from './drizzle-audit-log.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleConversations } from './drizzle-conversations.js';
import { createDrizzleEmailSettings } from './drizzle-email-settings.js';
import { createDrizzleEmailTemplates } from './drizzle-email-templates.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleMessages } from './drizzle-messages.js';
import { createDrizzleOrganizationDirectory } from './drizzle-organizations.js';
import { createDrizzlePrivacyNotices } from './drizzle-privacy-notices.js';
import { createDrizzleResponsePromises } from './drizzle-report-history.js';
import { createDrizzleTransaction } from './drizzle-repositories.js';

let handle: DbHandle;

interface World {
  readonly org: string;
  readonly slug: string;
  readonly jobId: string;
  readonly candidateId: string;
  readonly applicationId: string;
}

async function insertWorld(): Promise<World> {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const job = buildJob({ id: randomUUID(), slug: randomUUID(), organizationId: org, status: 'published', publishedAt: new Date() });
  await createDrizzleJobs(handle.db).create(job);
  const candidate = buildCandidate({ id: randomUUID(), organizationId: org, email: `${randomUUID()}@x.it` });
  await createDrizzleCandidates(handle.db).create(candidate);
  const application = buildApplication({ id: randomUUID(), organizationId: org, jobId: job.id, candidateId: candidate.id });
  await createDrizzleApplications(handle.db).create(application);
  return { org, slug: org, jobId: job.id, candidateId: candidate.id, applicationId: application.id };
}

const message = (world: World, overrides = {}) =>
  buildMessage({ id: randomUUID(), organizationId: world.org, applicationId: world.applicationId, candidateId: world.candidateId, ...overrides });

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

describe('createDrizzleEmailTemplates', () => {
  it('saves, updates, finds by id and kind, lists newest first, deletes, and isolates organizations', async () => {
    const repo = createDrizzleEmailTemplates(handle.db);
    const a = (await insertWorld()).org;
    const b = (await insertWorld()).org;
    const receipt = buildEmailTemplate({ id: randomUUID(), organizationId: a, kind: 'receipt', createdAt: new Date('2026-01-01') });
    const custom = buildEmailTemplate({ id: randomUUID(), organizationId: a, createdAt: new Date('2026-02-01') });
    expect(await repo.save(receipt)).toEqual(receipt);
    await repo.save(custom);
    expect((await repo.list(a)).map((t) => t.id)).toEqual([custom.id, receipt.id]);
    const updated = { ...receipt, name: 'New', updatedAt: new Date('2026-03-01') };
    expect(await repo.save(updated)).toEqual(updated);
    expect(await repo.findById(a, receipt.id)).toEqual(updated);
    expect(await repo.findByKind(a, 'receipt')).toEqual(updated);
    expect(await repo.findByKind(a, 'stage_update')).toBeNull();
    expect(await repo.findById(b, receipt.id)).toBeNull();
    expect(await repo.findByKind(b, 'receipt')).toBeNull();
    expect(await repo.list(b)).toEqual([]);
    expect(await repo.delete(b, receipt.id)).toBe(false);
    expect(await repo.delete(a, receipt.id)).toBe(true);
    expect(await repo.delete(a, receipt.id)).toBe(false);
  });

  it('refuses a second template of a singleton kind, allows many custom, and never overwrites another organization', async () => {
    const repo = createDrizzleEmailTemplates(handle.db);
    const a = (await insertWorld()).org;
    const b = (await insertWorld()).org;
    await repo.save(buildEmailTemplate({ id: randomUUID(), organizationId: a, kind: 'outcome_hired' }));
    await expect(repo.save(buildEmailTemplate({ id: randomUUID(), organizationId: a, kind: 'outcome_hired' }))).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.save(buildEmailTemplate({ id: randomUUID(), organizationId: b, kind: 'outcome_hired' }))).resolves.toBeDefined();
    await repo.save(buildEmailTemplate({ id: randomUUID(), organizationId: a }));
    await expect(repo.save(buildEmailTemplate({ id: randomUUID(), organizationId: a }))).resolves.toBeDefined();
    const mine = buildEmailTemplate({ id: randomUUID(), organizationId: a });
    await repo.save(mine);
    await expect(repo.save({ ...mine, organizationId: b })).rejects.toBeInstanceOf(ConflictError);
    expect((await repo.findById(a, mine.id))?.organizationId).toBe(a);
  });
});

describe('createDrizzleEmailSettings', () => {
  it('inserts then replaces by organization and isolates reads', async () => {
    const repo = createDrizzleEmailSettings(handle.db);
    const a = (await insertWorld()).org;
    const b = (await insertWorld()).org;
    expect(await repo.find(a)).toBeNull();
    const first = buildEmailSettings({ organizationId: a });
    expect(await repo.save(first)).toEqual(first);
    const second = buildEmailSettings({
      organizationId: a,
      senderName: 'Other',
      fromAddress: 'hr@acme.com',
      domain: 'acme.com',
      domainStatus: 'pending',
      domainRecords: [{ type: 'TXT', name: 'x', value: 'y' }],
      updatedAt: new Date('2026-05-01'),
    });
    expect(await repo.save(second)).toEqual(second);
    expect(await repo.find(a)).toEqual(second);
    expect(await repo.find(b)).toBeNull();
  });
});

describe('createDrizzleConversations', () => {
  it('ensures one conversation per application and finds it by application and by token', async () => {
    const repo = createDrizzleConversations(handle.db);
    const w = await insertWorld();
    const other = await insertWorld();
    const first = { applicationId: w.applicationId, organizationId: w.org, token: 'a'.repeat(24) + randomUUID().slice(0, 4).replace(/[^a-z]/g, 'b') };
    expect(await repo.ensure(first)).toEqual(first);
    expect(await repo.ensure({ ...first, token: 'z'.repeat(24) })).toEqual(first);
    expect(await repo.findByApplication(w.org, w.applicationId)).toEqual(first);
    expect(await repo.findByToken(first.token)).toEqual(first);
    expect(await repo.findByToken('q'.repeat(24))).toBeNull();
    expect(await repo.findByApplication(other.org, w.applicationId)).toBeNull();
  });
});

describe('createDrizzleMessages', () => {
  it('creates, claims, finds, lists oldest first and counts per application, isolating organizations', async () => {
    const repo = createDrizzleMessages(handle.db);
    const w = await insertWorld();
    const other = await insertWorld();
    const m2 = message(w, { createdAt: new Date('2026-02-01') });
    const m1 = message(w, { createdAt: new Date('2026-01-01') });
    expect(await repo.create(m2)).toEqual(m2);
    await repo.create(m1);
    expect((await repo.listByApplication(w.org, w.applicationId)).map((m) => m.id)).toEqual([m1.id, m2.id]);
    expect(await repo.listByApplication(other.org, w.applicationId)).toEqual([]);
    expect(await repo.countByApplication(w.org, [w.applicationId, 'none'])).toEqual({ [w.applicationId]: 2, none: 0 });
    expect(await repo.countByApplication(other.org, [w.applicationId])).toEqual({ [w.applicationId]: 0 });
    expect(await repo.countByApplication(w.org, [])).toEqual({});
    const sent = { ...m1, status: 'sent' as const, sentAt: new Date('2026-01-02'), providerMessageId: 'p1' };
    // queued → sending is the claim: only one of two deliveries gets it (#12).
    expect(await repo.transition(w.org, m1.id, 'queued', { status: 'sending' })).toMatchObject({ status: 'sending' });
    expect(await repo.transition(w.org, m1.id, 'queued', { status: 'sending' })).toBeNull();
    expect(await repo.transition(w.org, m1.id, 'sending', { status: 'sent', sentAt: sent.sentAt, providerMessageId: 'p1' })).toEqual(sent);
    expect(await repo.findById(w.org, m1.id)).toEqual(sent);
    expect(await repo.findById(other.org, m1.id)).toBeNull();
    expect(await repo.transition(other.org, m1.id, 'sent', { status: 'failed' })).toBeNull();
    expect((await repo.findById(w.org, m1.id))?.status).toBe('sent');
  });

  it('leaves historical messages out of the hourly caps', async () => {
    const repo = createDrizzleMessages(handle.db);
    const w = await insertWorld();
    const since = new Date('2026-01-01');
    const at = new Date('2026-01-02');
    await repo.create(message(w, { createdAt: at, status: 'sent', sentBy: 'system' }));
    await repo.create(message(w, { createdAt: at, status: 'sent', sentBy: 'system', historical: true }));
    await repo.create(message(w, { createdAt: at, status: 'sent', historical: true }));
    expect(await repo.countOutboundSince(w.org, w.candidateId, since)).toBe(1);
    expect(await repo.countSystemOutboundSince(w.org, since)).toBe(1);
    expect((await repo.listByApplication(w.org, w.applicationId)).filter((m) => m.historical)).toHaveLength(2);
  });

  it('dedupes inbound ids per organization with a ConflictError', async () => {
    const repo = createDrizzleMessages(handle.db);
    const w = await insertWorld();
    const other = await insertWorld();
    const inbound = (world: World) => message(world, { direction: 'inbound', status: 'received', sentBy: null, inboundMessageId: '<same@x>', rawText: 'raw', unverifiedSender: true });
    await repo.create(inbound(w));
    await expect(repo.create(inbound(w))).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.create(inbound(other))).resolves.toBeDefined();
    expect(await repo.findByInboundMessageId(w.org, '<same@x>')).toMatchObject({ unverifiedSender: true, rawText: 'raw', sentBy: null });
    expect(await repo.findByInboundMessageId(w.org, '<nope>')).toBeNull();
  });
});

describe('messaging flow on Postgres', () => {
  it('stores the receipt after submitApplication, delivers it, and files the candidate reply', async () => {
    const org = randomUUID();
    await handle.db.insert(schema.organization).values({ id: org, name: 'Acme', slug: org, createdAt: new Date() });
    const jobs = createDrizzleJobs(handle.db);
    const job = buildJob({ id: randomUUID(), slug: 'backend', organizationId: org, status: 'published', publishedAt: new Date() });
    await jobs.create(job);
    const privacyNotices = createDrizzlePrivacyNotices(handle.db);
    await privacyNotices.create(buildPrivacyNotice({ id: randomUUID(), organizationId: org }));
    const messages = createDrizzleMessages(handle.db);
    const conversations = createDrizzleConversations(handle.db);
    const queue = createInMemoryTaskQueue();
    const newToken = createTokenGenerator();
    await submitApplication(
      {
        organizations: createDrizzleOrganizationDirectory(handle.db),
        jobs,
        privacyNotices,
        intake: createDrizzleApplicationIntake(handle.db),
        files: createInMemoryFileStorage(),
        queue,
        receipts: { templates: createDrizzleEmailTemplates(handle.db), conversations, messages, config: testMessagingConfig, newToken },
        cvSniffer: fakeCvSniffer,
        newId: randomUUID,
        now: () => new Date(),
      },
      { organizationSlug: org, jobSlug: 'backend', form: validApplicationForm({ email: 'ada@example.com' }), cv: { bytes: fakePdfBytes(), declaredName: 'cv.pdf' } },
    );
    const email = queue.jobs().find((j) => j.name === 'email.send');
    expect(email?.payload.organizationId).toBe(org);

    const sender = createFakeEmailSender();
    const candidates = createDrizzleCandidates(handle.db);
    const applications = createDrizzleApplications(handle.db);
    const auditLog = createDrizzleAuditLog(handle.db);
    const deliverDeps = { auditLog, transaction: createDrizzleTransaction(handle.db), organizations: createDrizzleOrganizationDirectory(handle.db), candidates, applications, settings: createDrizzleEmailSettings(handle.db), promises: createDrizzleResponsePromises(handle.db), conversations, messages, sender, config: testMessagingConfig, newToken, now: () => new Date() };
    expect(await deliverMessage(deliverDeps, systemActor({ organizationId: org }), { organizationId: org, messageId: email?.payload.messageId })).toBe('sent');
    const [sent] = sender.sent();
    const token = /reply\+([a-z2-7]+)@/.exec(sent?.replyTo ?? '')?.[1];
    expect(token).toBeDefined();

    const reply = { to: [sent?.replyTo ?? ''], from: 'Ada <ada@example.com>', subject: 'Re', text: 'Eccomi', messageId: '<r1>', receivedAt: new Date() };
    const deps = { auditLog, transaction: createDrizzleTransaction(handle.db), candidates, applications, conversations, messages, newId: randomUUID, now: () => new Date() };
    expect(await receiveInboundEmail(deps, reply)).toEqual({ stored: true });
    expect(await receiveInboundEmail(deps, reply)).toMatchObject({ stored: false, reason: 'duplicate' });
    const application = (await applications.listByJob(org, job.id))[0];
    const conversation = await messages.listByApplication(org, application?.id ?? '');
    expect(conversation.map((m) => [m.direction, m.status])).toEqual([['outbound', 'sent'], ['inbound', 'received']]);
    expect(conversation[1]?.unverifiedSender).toBe(false);
  });
});
