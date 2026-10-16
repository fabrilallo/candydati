import { candidateExportSchema, type Candidate, type CandidateExport } from '@candydati/domain';
import type { ApplicationRepository, CandidateNoteRepository, CvExtractionRepository } from '../../candidate-ports.js';
import type { FeedbackRecords } from '../../feedback-ports.js';
import type { FileStorage } from '../../intake-ports.js';
import type { JobRepository } from '../../job-ports.js';
import type { MessageRepository } from '../../messaging-ports.js';
import { sequential } from '../../sequential.js';
import { attachmentPathOf, cvPathOf, exportApplication, exportCandidate, exportNotes, iso, oldestFirst } from './export-mappers.js';

export interface ExportFile {
  /** Path inside the ZIP, as referenced by `applications[].cv.path`. */
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface CandidateExportBundle {
  readonly json: CandidateExport;
  readonly files: readonly ExportFile[];
  /** Paths of CV and attachment files that could not be read from storage: listed in `json`, absent from `files`. */
  readonly missingFiles: readonly string[];
}

export interface ExportSources extends FeedbackRecords {
  readonly applications: ApplicationRepository;
  readonly notes: CandidateNoteRepository;
  readonly extractions: CvExtractionRepository;
  readonly messages: MessageRepository;
  readonly jobs: JobRepository;
  readonly files: FileStorage;
}

/** null when there is nothing to read (a migrated application without a CV) or the file cannot be read. */
async function readFile(files: FileStorage, key: string | undefined): Promise<Uint8Array | null> {
  if (key === undefined) return null;
  try {
    return await files.get(key);
  } catch {
    return null;
  }
}

/** Everything stored about one candidate, validated against the public schema, plus the original CV and attachment files. */
export async function buildCandidateExport(sources: ExportSources, candidate: Candidate, exportedAt: Date): Promise<CandidateExportBundle> {
  const { organizationId } = candidate;
  const applications = (await sources.applications.listByCandidate(organizationId, candidate.id)).toSorted(oldestFirst);
  const ids = applications.map((a) => a.id);
  const [extractions, notes, attachments] = await sequential(
    () => sources.extractions.findByApplications(organizationId, ids),
    () => sources.notes.listByCandidate(organizationId, candidate.id),
    () => sources.applications.listAttachments(organizationId, ids),
  );
  const files: ExportFile[] = [];
  const missingFiles: string[] = [];
  const exportedApplications: CandidateExport['applications'] = [];
  for (const application of applications) {
    const path = cvPathOf(application);
    const [job, messages, bytes, feedback, feedbackRequests] = await sequential(
      () => sources.jobs.findById(organizationId, application.jobId),
      () => sources.messages.listByApplication(organizationId, application.id),
      () => readFile(sources.files, application.cv?.key),
      () => sources.interviewFeedback.listByApplication(organizationId, application.id),
      () => sources.feedbackRequests.listByApplication(organizationId, application.id),
    );
    if (path !== null) {
      if (bytes) files.push({ path, bytes });
      else missingFiles.push(path);
    }
    const own = attachments.filter((attachment) => attachment.applicationId === application.id);
    for (const attachment of own) {
      const content = await readFile(sources.files, attachment.key);
      if (content) files.push({ path: attachmentPathOf(attachment), bytes: content });
      else missingFiles.push(attachmentPathOf(attachment));
    }
    const extraction = extractions.find((e) => e.applicationId === application.id) ?? null;
    exportedApplications.push(exportApplication({ application, path, job, extraction, messages, feedback, feedbackRequests, attachments: own }));
  }
  const json = candidateExportSchema.parse({
    schemaVersion: 1,
    exportedAt: iso(exportedAt),
    candidate: exportCandidate(candidate),
    applications: exportedApplications,
    notes: exportNotes(notes),
  });
  return { json, files, missingFiles };
}

/** `candidate.json` plus the CV and attachment files, in one archive. */
export async function zipCandidateExport(zip: { add(path: string, bytes: Uint8Array): Promise<void>; finish(): Promise<Uint8Array> }, bundle: CandidateExportBundle): Promise<Uint8Array> {
  await zip.add('candidate.json', new TextEncoder().encode(`${JSON.stringify(bundle.json, null, 2)}\n`));
  for (const file of bundle.files) await zip.add(file.path, file.bytes);
  return zip.finish();
}
