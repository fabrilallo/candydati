import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { analyzeMigration, commitMigration, createDrizzleUnitOfWork, type MigrationAnalysisDeps, type MigrationCommitDeps } from '@candydati/core';
import type { MigrationPackageInput } from '@candydati/domain';
import { createMigrationPackageReader, newConversationToken, sniffAttachment, sniffCv, toMessagingConfig } from '@candydati/providers';
import { makePdf } from '@candydati/providers/testing';
import { strToU8, zipSync } from 'fflate';
import type { TestUser } from './client.js';
import { multipartBody } from './multipart.js';
import { testEnv, WEB_ORIGIN, type TestApp } from './test-app.js';

/** What the worker does for `migration.analyze` and `migration.commit`, driven by hand against the test database. */
export function migrationWorkerDeps(t: TestApp): { analysis: MigrationAnalysisDeps; commit: MigrationCommitDeps } {
  const uow = createDrizzleUnitOfWork(t.handle.db);
  const r = uow.repositories;
  const env = testEnv();
  const analysis: MigrationAnalysisDeps = {
    transaction: uow.transaction,
    auditLog: r.auditLog,
    migrations: r.migrations,
    migrationIssues: r.migrationIssues,
    candidates: r.candidates,
    privacyNotices: r.privacyNotices,
    files: t.files,
    queue: t.queue,
    cvSniffer: sniffCv,
    packages: createMigrationPackageReader(t.files),
    newId: randomUUID,
    now: () => new Date(),
  };
  const commit: MigrationCommitDeps = {
    ...analysis,
    jobs: r.jobs,
    applications: r.applications,
    extractions: r.extractions,
    organizations: r.organizations,
    members: r.members,
    migratedRows: r.migratedRows,
    consentTokens: r.consentTokens,
    attachmentSniffer: sniffAttachment,
    mail: { conversations: r.conversations, messages: r.messages, config: toMessagingConfig(env.platform, env.email), newToken: newConversationToken },
    newSecret: () => randomBytes(24).toString('base64url'),
    hash: (value) => createHash('sha256').update(value).digest('hex'),
  };
  return { analysis, commit };
}

const done = new WeakSet<object>();

/** Runs every `migration.analyze` and `migration.commit` not yet run (the in-memory queue only records). */
export async function runMigrationTasks(t: TestApp): Promise<number> {
  const deps = migrationWorkerDeps(t);
  let ran = 0;
  for (const job of t.queue.jobs()) {
    if (done.has(job)) continue;
    const payload = job.payload as { organizationId: string; batchId: string };
    if (job.name === 'migration.analyze') await analyzeMigration(deps.analysis, { ...payload, lastAttempt: true });
    else if (job.name === 'migration.commit') await commitMigration(deps.commit, { ...payload, lastAttempt: true });
    else continue;
    done.add(job);
    ran += 1;
  }
  return ran;
}

const DAY = 86_400_000;
const daysAgo = (days: number): string => new Date(Date.now() - days * DAY).toISOString();

/**
 * A small history: two closed jobs, a stage that needs a choice ("Applied", named alike in both jobs), one person with a
 * consent date, one whose retention expired (left out), one with no date and no CV, a note by someone who is not a
 * member and a historical email.
 */
export function samplePackage(): MigrationPackageInput {
  return {
    format: 'candydati-migration',
    version: 1,
    source: { system: 'oldats', exportedAt: daysAgo(1), producer: 'test@1' },
    users: [],
    jobs: [
      { ref: 'j1', title: 'Archived Backend', status: 'closed', createdAt: daysAgo(300), closedAt: daysAgo(200), stages: [{ ref: 's1', name: 'Applied' }, { ref: 's2', name: 'Colloquio HR', type: 'hr_interview' }] },
      { ref: 'j2', title: 'Archived Analyst', status: 'closed', createdAt: daysAgo(280), closedAt: daysAgo(150), stages: [{ ref: 't1', name: 'Applied' }, { ref: 't2', name: 'Technical round' }] },
    ],
    candidates: [
      { ref: 'c1', firstName: 'Ada', lastName: 'Bianchi', email: 'ada.migrata@example.com', tags: [], createdAt: daysAgo(290), consent: { givenAt: daysAgo(10) } },
      { ref: 'c2', firstName: 'Bruno', lastName: 'Scaduto', email: 'bruno.scaduto@example.com', tags: [], createdAt: daysAgo(900), consent: { givenAt: daysAgo(900), expiresAt: daysAgo(100) } },
      { ref: 'c3', firstName: 'Carla', lastName: 'Senzacv', email: 'carla.senzacv@example.com', tags: [], createdAt: daysAgo(270) },
    ],
    applications: [
      { ref: 'a1', candidateRef: 'c1', jobRef: 'j1', stageRef: 's2', createdAt: daysAgo(290), outcome: 'not_selected', closedAt: daysAgo(210), files: [{ path: 'files/a1/cv.pdf', kind: 'cv', fileName: 'cv.pdf' }], stageHistory: [{ stageRef: 's1', enteredAt: daysAgo(290) }, { stageRef: 's2', enteredAt: daysAgo(250) }] },
      { ref: 'a2', candidateRef: 'c3', jobRef: 'j2', stageRef: 't2', createdAt: daysAgo(270), outcome: 'hired', closedAt: daysAgo(160), files: [], stageHistory: [{ stageRef: 't1', enteredAt: daysAgo(270) }, { stageRef: 't2', enteredAt: daysAgo(240) }] },
      { ref: 'a3', candidateRef: 'c2', jobRef: 'j1', stageRef: 's1', createdAt: daysAgo(900), outcome: 'withdrawn', closedAt: daysAgo(890), files: [], stageHistory: [] },
    ],
    notes: [{ candidateRef: 'c1', applicationRef: 'a1', authorName: 'Mario Esterno', body: 'Ottimo colloquio, poca esperienza di team', createdAt: daysAgo(250) }],
    messages: [{ applicationRef: 'a1', direction: 'outbound', at: daysAgo(205), subject: 'Esito della selezione', body: 'Grazie per il tempo dedicato.' }],
  };
}

/** The package as a ZIP: `migration.json` and the CV it references. */
export function packageZip(manifest: unknown = samplePackage()): Uint8Array {
  return zipSync({ 'migration.json': strToU8(JSON.stringify(manifest)), 'files/a1/cv.pdf': makePdf(['Ada Bianchi', 'Backend Developer', 'Email: ada.migrata@example.com']) });
}

/** POST /api/v1/migrations as the browser would: session cookie, web origin, one `file` part. */
export function uploadMigration(t: TestApp, user: TestUser, bytes: Uint8Array = packageZip(), headers: Record<string, string> = {}) {
  const { payload, headers: form } = multipartBody([{ name: 'file', filename: 'package.zip', bytes }]);
  return t.app.inject({ method: 'POST', url: '/api/v1/migrations', headers: { origin: WEB_ORIGIN, cookie: user.cookieHeader(), ...form, ...headers }, payload });
}
