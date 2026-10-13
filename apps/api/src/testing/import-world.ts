import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  commitImport,
  createDrizzleUnitOfWork,
  type ImportCommitDeps,
} from '@tt/core';
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

/** The first `/consent/<token>` link in the messages of an application. */
export async function consentTokenOf(user: TestUser, applicationId: string): Promise<string> {
  const reply = await user.get<{ bodyText: string }[]>(`/api/v1/applications/${applicationId}/messages`);
  const text = reply.body.data?.map((message) => message.bodyText).join('\n') ?? '';
  const token = /\/consent\/([\w-]+)/.exec(text)?.[1];
  if (!token) throw new Error(`no consent link in ${text}`);
  return token;
}
