import {
  IMPORT_NOTE_MAX,
  placeholderEmail,
  type Application,
  type Candidate,
  type CvMediaType,
  type ImportBatch,
  type ImportItem,
  type Job,
  type ParsedImportCv,
} from '@candydati/domain';
import { ConflictError, CoreError } from '../../errors.js';
import type { ImportCommitDeps, ImportCommitRepositories } from '../../import-ports.js';
import { storeReconfirmationRequest } from './reconfirmation-request.js';

/** An item whose CV was read, checked and copied to its final key, ready to be written. */
export interface Prepared {
  readonly item: ImportItem;
  readonly candidateId: string;
  readonly applicationId: string;
  readonly cv: ParsedImportCv;
  readonly stored: { readonly key: string; readonly fileName: string; readonly mediaType: CvMediaType; readonly sizeBytes: number };
}

export interface Written {
  readonly prepared: Prepared;
  /** `skipped`: already applied; `taken`: another run of the commit wrote this item first; `failed`: its write failed alone. */
  readonly outcome: 'created' | 'merged' | 'skipped' | 'taken' | 'failed';
  /** The candidate the application went to: the new one, or the existing one for a merge. */
  readonly candidateId: string;
  /** The queued reconfirmation request, when the person has an address. */
  readonly messageId: string | null;
}

export const isKept = (written: Written): boolean => written.outcome === 'created' || written.outcome === 'merged';

export interface CommitContext {
  readonly deps: ImportCommitDeps;
  readonly batch: ImportBatch;
  readonly job: Job;
  readonly organization: { readonly id: string; readonly name: string };
  readonly importedAt: Date;
  readonly expiresAt: Date;
}

const CODE = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * What is stored as an item's error: a short code, never the error's text (a driver message quotes the values, so it can
 * carry the person's data). A domain conflict that is already a code (`job_closed`) keeps it.
 */
export function itemErrorCode(error: unknown): string {
  if (error instanceof ConflictError && CODE.test(error.message)) return error.message;
  if (error instanceof CoreError) return error.code;
  return 'write_failed';
}

function newCandidate(ctx: CommitContext, prepared: Prepared): Candidate {
  const person = prepared.item.proposal.candidate;
  const { importedAt, expiresAt, batch } = ctx;
  return {
    id: prepared.candidateId,
    organizationId: batch.organizationId,
    firstName: person.firstName || person.lastName || '-',
    lastName: person.firstName === '' ? '' : person.lastName,
    email: person.email ?? placeholderEmail(prepared.candidateId),
    phone: person.phone,
    linkedinUrl: person.linkedinUrl,
    tags: person.tags,
    talentPool: false,
    retentionExpiresAt: expiresAt,
    importBatchId: batch.id,
    createdAt: importedAt,
    updatedAt: importedAt,
  };
}

function newApplication(ctx: CommitContext, prepared: Prepared, candidateId: string): Application {
  const { importedAt, expiresAt, batch } = ctx;
  return {
    id: prepared.applicationId,
    organizationId: batch.organizationId,
    jobId: batch.jobId,
    candidateId,
    stageId: batch.stageId,
    outcome: null,
    message: '',
    cv: prepared.stored,
    // Nothing was agreed: the placeholders say so, `consentStatus` is what counts (see ConsentRecord).
    consent: { privacyNoticeId: '', privacyNoticeVersion: 0, scopes: [], givenAt: importedAt },
    consentStatus: 'to_renew',
    importBatchId: batch.id,
    retentionExpiresAt: expiresAt,
    source: 'import',
    origin: 'import',
    createdAt: importedAt,
    updatedAt: importedAt,
    stageChangedAt: importedAt,
    closedAt: null,
    responseDueAt: null,
    respondedAt: null,
  };
}

/** The reconfirmation request of the person, in the chunk's transaction. */
const queueReconfirmation = (ctx: CommitContext, repos: ImportCommitRepositories, application: Application, person: { readonly id: string; readonly firstName: string }): Promise<string> =>
  storeReconfirmationRequest(ctx.deps, repos, {
    organization: ctx.organization,
    job: { title: ctx.job.content.title, language: ctx.job.content.language },
    applicationId: application.id,
    person,
    expiresAt: ctx.expiresAt,
    at: ctx.importedAt,
  });

/** One item, inside the chunk's transaction (and its own savepoint). */
export async function writeItem(ctx: CommitContext, repos: ImportCommitRepositories, prepared: Prepared): Promise<Written> {
  const { deps, batch } = ctx;
  const { organizationId } = batch;
  const person = prepared.item.proposal.candidate;
  const existing = person.email === null ? null : await repos.candidates.findByEmail(organizationId, person.email);
  if (existing && (await repos.applications.findOpen(organizationId, batch.jobId, existing.id))) {
    await repos.importItems.setStatus(organizationId, prepared.item.id, 'failed', 'already_applied');
    return { prepared, outcome: 'skipped', candidateId: existing.id, messageId: null };
  }
  const candidate = existing ?? (await repos.candidates.create(newCandidate(ctx, prepared)));
  const application = await repos.applications.create(newApplication(ctx, prepared, candidate.id));
  // The application enters its stage now, like one from the careers page: without the event the funnel would not count it.
  await repos.stageEvents.record({
    id: deps.newId(),
    organizationId,
    applicationId: application.id,
    jobId: batch.jobId,
    fromStageId: null,
    toStageId: application.stageId,
    outcome: null,
    occurredAt: ctx.importedAt,
    actorType: 'system',
    backfilled: false,
  });
  const parsed = prepared.cv;
  await repos.extractions.upsert({
    applicationId: application.id,
    organizationId,
    status: parsed.extraction ? 'done' : 'text_only',
    text: parsed.text,
    data: parsed.extraction,
    source: parsed.extraction ? 'model' : 'text',
    updatedAt: ctx.importedAt,
  });
  if (person.note !== null && person.note.trim() !== '') {
    await repos.notes.create({ id: deps.newId(), organizationId, candidateId: candidate.id, applicationId: application.id, authorId: batch.createdBy, authorName: null, body: person.note.slice(0, IMPORT_NOTE_MAX), createdAt: ctx.importedAt });
  }
  const messageId = person.email === null ? null : await queueReconfirmation(ctx, repos, application, { id: candidate.id, firstName: person.firstName });
  await repos.importItems.setStatus(organizationId, prepared.item.id, 'imported', null);
  return { prepared, outcome: existing ? 'merged' : 'created', candidateId: candidate.id, messageId };
}
