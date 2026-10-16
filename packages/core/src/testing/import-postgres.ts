import { createHash, randomUUID } from 'node:crypto';
import { schema, type DbHandle } from '@candydati/db';
import { importFileKey, type ParsedImportCvInput } from '@candydati/domain';
import type { ConsentDeps, ImportCommitDeps, ImportUndoDeps } from '../import-ports.js';
import type { RetentionDeps } from '../privacy-ports.js';
import { createDrizzleApplications } from '../adapters/drizzle-applications.js';
import { createDrizzleAuditLog } from '../adapters/drizzle-audit-log.js';
import { createDrizzleCandidates } from '../adapters/drizzle-candidates.js';
import { createDrizzleConversations } from '../adapters/drizzle-conversations.js';
import { createDrizzleErasure } from '../adapters/drizzle-erasure.js';
import { createDrizzleImportCommit } from '../adapters/drizzle-import-commit.js';
import { createDrizzleConsentTokens, createDrizzleImportAnalyses, createDrizzleImportBatches, createDrizzleImportItems } from '../adapters/drizzle-imports.js';
import { createDrizzleJobs } from '../adapters/drizzle-jobs.js';
import { createDrizzleMemberDirectory } from '../adapters/drizzle-members.js';
import { createDrizzleMessages } from '../adapters/drizzle-messages.js';
import { createDrizzleNotifications } from '../adapters/drizzle-notifications.js';
import { createDrizzleOrganizationDirectory } from '../adapters/drizzle-organizations.js';
import { createDrizzlePrivacyNotices } from '../adapters/drizzle-privacy-notices.js';
import { createDrizzleDataExports, createDrizzleRetentionRuns } from '../adapters/drizzle-privacy.js';
import { createDrizzleTransaction } from '../adapters/drizzle-repositories.js';
import { recordImportAnalysis, startImportAnalysis } from '../use-cases/imports/analyze.js';
import { commitImport } from '../use-cases/imports/commit-import.js';
import { createImportBatch } from '../use-cases/imports/create-import-batch.js';
import { requestImportCommit } from '../use-cases/imports/request-commit.js';
import { createDrizzleJobTeams } from '../adapters/drizzle-job-teams.js';
import { userActor } from './actors.js';
import { buildJob } from './job-fixtures.js';
import { buildPrivacyNotice, fakePdfBytes } from './candidate-fixtures.js';
import { createInMemoryFileStorage, createInMemoryTaskQueue, fakeCvSniffer } from './in-memory-files.js';
import { createFakeEmailSender, testMessagingConfig } from './in-memory-messaging.js';
import { createDrizzleEmailSettings } from '../adapters/drizzle-email-settings.js';
import { createDrizzleResponsePromises } from '../adapters/drizzle-report-history.js';
import type { DeliverDeps } from '../messaging-ports.js';
import { deliverMessage } from '../use-cases/messaging/deliver-message.js';
import { systemActor } from './actors.js';

/** The import world of the Postgres tests: what the worker and the routes would do, driven by hand. */

const hash = (secret: string): string => createHash('sha256').update(secret).digest('hex');

export interface World {
  readonly org: string;
  readonly jobId: string;
  readonly otherJobId: string;
  readonly files: ReturnType<typeof createInMemoryFileStorage>;
  readonly queue: ReturnType<typeof createInMemoryTaskQueue>;
  readonly deps: ImportCommitDeps & ImportUndoDeps & ConsentDeps & RetentionDeps;
  readonly now: { current: Date };
  /** The `email.send` worker's deps, with the fake provider. */
  readonly deliver: DeliverDeps;
  /** Consent secrets by application id, as the sent reconfirmation emails carried them. */
  readonly secrets: Map<string, string>;
}

/** An organization with two published jobs and a notice, and the import, consent and retention deps on Postgres. */
export async function buildImportWorld(handle: DbHandle, NOW: Date): Promise<World> {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const jobs = createDrizzleJobs(handle.db);
  const jobId = randomUUID();
  const otherJobId = randomUUID();
  for (const id of [jobId, otherJobId]) await jobs.create(buildJob({ id, slug: id, organizationId: org, status: 'published', publishedAt: NOW }));
  await createDrizzlePrivacyNotices(handle.db).create(buildPrivacyNotice({ id: randomUUID(), organizationId: org, version: 1 }));
  const files = createInMemoryFileStorage();
  const queue = createInMemoryTaskQueue();
  const now = { current: NOW };
  const db = handle.db;
  const deps = {
    auditLog: createDrizzleAuditLog(db),
    transaction: createDrizzleTransaction(db),
    jobTeams: createDrizzleJobTeams(db),
    jobs,
    candidates: createDrizzleCandidates(db),
    applications: createDrizzleApplications(db),
    imports: createDrizzleImportBatches(db),
    importItems: createDrizzleImportItems(db),
    importAnalyses: createDrizzleImportAnalyses(db),
    consentTokens: createDrizzleConsentTokens(db),
    commit: createDrizzleImportCommit(db),
    organizations: createDrizzleOrganizationDirectory(db),
    privacyNotices: createDrizzlePrivacyNotices(db),
    erasure: createDrizzleErasure(db),
    mail: { conversations: createDrizzleConversations(db), messages: createDrizzleMessages(db), config: testMessagingConfig, newToken: () => randomUUID().replaceAll('-', '') },
    notifications: createDrizzleNotifications(db),
    members: createDrizzleMemberDirectory(db),
    retentionRuns: createDrizzleRetentionRuns(db),
    dataExports: createDrizzleDataExports(db),
    cvSniffer: fakeCvSniffer,
    files,
    queue,
    newId: () => randomUUID(),
    newSecret: () => `${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`,
    hash,
    now: () => now.current,
  } as unknown as World['deps'];
  const deliver: DeliverDeps = {
    auditLog: deps.auditLog,
    transaction: deps.transaction,
    organizations: deps.organizations,
    candidates: deps.candidates,
    applications: deps.applications,
    settings: createDrizzleEmailSettings(db),
    conversations: deps.mail.conversations,
    messages: deps.mail.messages,
    promises: createDrizzleResponsePromises(db),
    sender: createFakeEmailSender(),
    config: testMessagingConfig,
    newToken: deps.mail.newToken,
    now: deps.now,
    reconfirmation: { consentTokens: deps.consentTokens, newSecret: deps.newSecret, hash },
  };
  return { org, jobId, otherJobId, files, queue, deps, now, deliver, secrets: new Map() };
}

export const recruiterOf = (org: string) => userActor({ id: 'user_rec', organizationId: org, role: 'recruiter' });

export interface Person {
  readonly first: string;
  readonly last: string;
  readonly email: string;
}
export const newPerson = (): Person => {
  const unique = randomUUID().slice(0, 8);
  return { first: `Zelda${unique}`, last: `Quuxington${unique}`, email: `zelda.${unique}@example.org` };
};

/** Creates, analyses and returns a ready batch for these people (CV + row each), playing the worker. */
export async function readyBatch(world: World, people: readonly Person[], jobId = world.jobId): Promise<string> {
  const { deps, org } = world;
  const batch = await createImportBatch(deps, recruiterOf(org), { jobId, stageId: 'received', files: [{ fileName: 'import.zip', bytes: fakePdfBytes() }] });
  await startImportAnalysis(deps, { organizationId: org, batchId: batch.id });
  const cvs: ParsedImportCvInput[] = [];
  for (const person of people) {
    const key = importFileKey(org, batch.id, `cv/${person.last}.pdf`);
    await world.files.put(key, fakePdfBytes(), 'application/pdf');
    cvs.push({ fileName: `${person.last}.pdf`, key, text: `CV of ${person.first} ${person.last}`, extraction: null, name: `${person.first} ${person.last}`, email: person.email });
  }
  const rows = people.map((p, index) => ({ index: index + 2, cells: { Nome: p.first, Cognome: p.last, Email: p.email, Note: `Note on ${p.first}`, Telefono: '+39 347 0001112' } }));
  await recordImportAnalysis(deps, { organizationId: org, batchId: batch.id, headers: ['Nome', 'Cognome', 'Email', 'Note', 'Telefono'], cvs, rows });
  return batch.id;
}

/** Plays the `email.send` worker for the queued tasks; the consent secrets exist only in the emails it sends. */
export async function deliverQueued(world: World): Promise<void> {
  for (const job of world.queue.jobs()) {
    if (job.name !== 'email.send') continue;
    const message = await world.deliver.messages.findById(job.payload.organizationId, job.payload.messageId);
    if (!message || message.status !== 'queued') continue;
    await deliverMessage(world.deliver, systemActor({ organizationId: world.org }), job.payload);
    const secret = /\/consent\/(\S+)/.exec((world.deliver.sender as ReturnType<typeof createFakeEmailSender>).sent().at(-1)?.text ?? '')?.[1];
    if (secret) world.secrets.set(message.applicationId, secret);
  }
}

export async function runCommit(world: World, batchId: string): Promise<void> {
  await requestImportCommit(world.deps, recruiterOf(world.org), { batchId });
  await commitImport(world.deps, { organizationId: world.org, batchId });
  await deliverQueued(world);
}

