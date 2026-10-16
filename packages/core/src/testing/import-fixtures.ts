import { importFileKey, type ImportBatch, type ParsedImportCvInput, type ParsedImportRow } from '@candydati/domain';
import { buildJob, fakeDocxBytes, fakePdfBytes, ORG_A, seedImportWorld, userActor, type ImportSeedOptions, type TestImportDeps } from './index.js';
import { createImportBatch } from '../use-cases/imports/create-import-batch.js';
import { recordImportAnalysis, startImportAnalysis } from '../use-cases/imports/analyze.js';
import { requestImportCommit } from '../use-cases/imports/request-commit.js';
import { commitImport } from '../use-cases/imports/commit-import.js';
import { deliverMessage } from '../use-cases/messaging/deliver-message.js';
import { systemActor } from './actors.js';

export const recruiter = userActor({ id: 'user_rec', organizationId: ORG_A, role: 'recruiter' });
export const outsider = userActor({ id: 'user_out', organizationId: 'org_b', role: 'owner' });
export const HEADERS = ['Nome', 'Cognome', 'Email', 'Telefono', 'Note', 'Tag', 'CV'];
export const JOB_2 = 'job_2';

export const importWorld = (options: ImportSeedOptions = {}): TestImportDeps =>
  seedImportWorld({
    jobs: [
      buildJob({ id: 'job_1', slug: 'backend', organizationId: ORG_A, status: 'published', publishedAt: new Date('2026-02-01T00:00:00Z') }),
      buildJob({ id: JOB_2, slug: 'frontend', organizationId: ORG_A, status: 'published', publishedAt: new Date('2026-02-01T00:00:00Z') }),
    ],
    ...options,
  });

export interface CvSpec {
  readonly file: string;
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly bytes?: Uint8Array;
}

export const row = (index: number, cells: Record<string, string>): ParsedImportRow => ({ index, cells });

/** Creates a batch with one uploaded ZIP, then plays the worker: files are stored under the batch prefix, parsed and analysed. */
export async function readyBatch(
  deps: TestImportDeps,
  cvs: readonly CvSpec[],
  rows: readonly ParsedImportRow[],
  jobId = 'job_1',
): Promise<ImportBatch> {
  const created = await createImportBatch(deps, recruiter, { jobId, stageId: 'received', files: [{ fileName: 'import.zip', bytes: fakePdfBytes() }] });
  await startImportAnalysis(deps, { organizationId: ORG_A, batchId: created.id });
  const parsed: ParsedImportCvInput[] = [];
  for (const cv of cvs) {
    const key = importFileKey(ORG_A, created.id, `cv/${cv.file}`);
    await deps.files.put(key, cv.bytes ?? (cv.file.endsWith('.docx') ? fakeDocxBytes() : fakePdfBytes()), 'application/pdf');
    parsed.push({ fileName: cv.file, key, text: `CV text of ${cv.name ?? cv.file}`, extraction: null, ...(cv.name ? { name: cv.name } : {}), ...(cv.email ? { email: cv.email } : {}), ...(cv.phone ? { phone: cv.phone } : {}) });
  }
  return recordImportAnalysis(deps, { organizationId: ORG_A, batchId: created.id, headers: HEADERS, cvs: parsed, rows: [...rows] });
}

/** Confirms the preview and runs the commit as the worker would. */
export async function commit(deps: TestImportDeps, batchId: string): Promise<ImportBatch> {
  await requestImportCommit(deps, recruiter, { batchId });
  return commitImport(deps, { organizationId: ORG_A, batchId });
}

export const MARIO: CvSpec = { file: 'Mario_Rossi.pdf', name: 'Mario Rossi', email: 'mario@example.com' };
export const GIULIA: CvSpec = { file: 'Giulia_Bianchi.docx', name: 'Giulia Bianchi' };
export const MARIO_ROW = row(2, { Nome: 'Mario', Cognome: 'Rossi', Email: 'mario@example.com', Telefono: '333 111', Note: 'Ottimo colloquio', Tag: 'java' });
export const GIULIA_ROW = row(3, { Nome: 'Giulia', Cognome: 'Bianchi', Email: 'giulia@example.com' });

/**
 * Plays the `email.send` worker for every queued message. Returns, by application, the consent secret the
 * reconfirmation email carried: it exists only in the sent email, never in the database.
 */
export async function deliverQueued(deps: TestImportDeps): Promise<ReadonlyMap<string, string>> {
  const secrets = new Map<string, string>();
  for (const message of deps.messagingStore.read().messages.filter((m) => m.status === 'queued')) {
    const before = deps.sender.sent().length;
    await deliverMessage(deps, systemActor({ organizationId: message.organizationId }), { organizationId: message.organizationId, messageId: message.id });
    const email = deps.sender.sent()[before];
    const secret = email ? /\/consent\/(\S+)/.exec(email.text)?.[1] : undefined;
    if (secret) secrets.set(message.applicationId, secret);
  }
  return secrets;
}
