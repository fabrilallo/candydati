import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  commitImport,
  createDrizzleUnitOfWork,
  deliverMessage,
  type DeliverDeps,
  type ImportCommitDeps,
} from '@tt/core';
import { createFakeEmailSender, systemActor } from '@tt/core/testing';
import { eq, schema } from '@tt/db';
import { CONSENT_LINK } from '@tt/domain';
import { newConversationToken, runImportAnalysis, sniffCv, toMessagingConfig } from '@tt/providers';
import { makePdf } from '@tt/providers/testing';
import { testEnv, type TestApp } from './test-app.js';
import { multipartBody, type FieldPart, type FilePart } from './multipart.js';
import { WEB_ORIGIN } from './test-app.js';
import type { TestUser } from './client.js';

/** What the worker does for the import tasks, driven by hand against the test database and the in-memory queue. */
export function importWorkerDeps(t: TestApp): ImportCommitDeps {
  const uow = createDrizzleUnitOfWork(t.handle.db);
  const r = uow.repositories;
  const env = testEnv();
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobs: r.jobs,
    candidates: r.candidates,
    applications: r.applications,
    imports: r.imports,
    importItems: r.importItems,
    importAnalyses: r.importAnalyses,
    files: t.files,
    queue: t.queue,
    newId: randomUUID,
    now: () => new Date(),
    commit: r.commit,
    organizations: r.organizations,
    cvSniffer: sniffCv,
    mail: { conversations: r.conversations, messages: r.messages, config: toMessagingConfig(env.platform, env.email), newToken: newConversationToken },
    newSecret: () => randomBytes(24).toString('base64url'),
    hash: (secret) => createHash('sha256').update(secret).digest('hex'),
  };
}

const done = new WeakSet<object>();

/** Runs every `import.analyze` and `import.commit` not yet run (the in-memory queue only records). */
export async function runImportTasks(t: TestApp): Promise<number> {
  const deps = importWorkerDeps(t);
  let ran = 0;
  for (const job of t.queue.jobs()) {
    if (done.has(job)) continue;
    if (job.name === 'import.analyze') await runImportAnalysis(deps, job.payload, { lastAttempt: true });
    else if (job.name === 'import.commit') await commitImport(deps, job.payload);
    else continue;
    done.add(job);
    ran += 1;
  }
  return ran;
}

export interface UploadFile {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

export interface UploadOptions {
  readonly fields?: readonly FieldPart[];
  readonly headers?: Record<string, string>;
}

/** POST /api/v1/imports as the user's browser would: session cookie, web origin, multipart. */
export function uploadImport(t: TestApp, user: TestUser, jobId: string, files: readonly UploadFile[], options: UploadOptions = {}) {
  const parts: (FieldPart | FilePart)[] = [
    ...(options.fields ?? [{ name: 'jobId', value: jobId }, { name: 'stageId', value: 'received' }]),
    ...files.map((file): FilePart => ({ name: 'files', filename: file.fileName, bytes: file.bytes })),
  ];
  const { payload, headers } = multipartBody(parts);
  return t.app.inject({ method: 'POST', url: '/api/v1/imports', headers: { origin: WEB_ORIGIN, cookie: user.cookieHeader(), ...headers, ...options.headers }, payload });
}

/** A CV PDF with a name, a role and an email on the first lines, as the analysis reads them. */
export const cvPdf = (name: string, email: string | null, role = 'Data Analyst'): Uint8Array =>
  makePdf([name, role, ...(email ? [`Email: ${email}`] : []), 'Esperienza: analisi dati e reportistica']);

/**
 * Plays the `email.send` worker for the application's queued reconfirmation request and returns the secret its email
 * carried: the stored message holds only a placeholder, the link is made at send time.
 */
export async function consentTokenOf(t: TestApp, user: TestUser, applicationId: string): Promise<string> {
  const reply = await user.get<{ id: string; status: string; bodyText: string }[]>(`/api/v1/applications/${applicationId}/messages`);
  const request = reply.body.data?.find((message) => message.status === 'queued' && message.bodyText.includes(CONSENT_LINK));
  if (!request) throw new Error('no queued reconfirmation request');
  const [row] = await t.handle.db.select({ organizationId: schema.message.organizationId }).from(schema.message).where(eq(schema.message.id, request.id));
  if (!row) throw new Error('message not found');
  const sender = createFakeEmailSender();
  const deps = importWorkerDeps(t);
  const uow = createDrizzleUnitOfWork(t.handle.db);
  const r = uow.repositories;
  const deliver: DeliverDeps = {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    organizations: r.organizations,
    candidates: r.candidates,
    applications: r.applications,
    settings: r.settings,
    conversations: r.conversations,
    messages: r.messages,
    promises: r.promises,
    sender,
    config: deps.mail.config,
    newToken: newConversationToken,
    now: () => new Date(),
    reconfirmation: { consentTokens: r.consentTokens, newSecret: deps.newSecret, hash: deps.hash },
  };
  await deliverMessage(deliver, systemActor({ organizationId: row.organizationId }), { organizationId: row.organizationId, messageId: request.id });
  const token = /\/consent\/([\w-]+)/.exec(sender.sent().at(-1)?.text ?? '')?.[1];
  if (!token) throw new Error('no consent link in the email sent');
  return token;
}
