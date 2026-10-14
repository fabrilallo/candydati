import { candidateExportSchema, type Application, type Candidate, type CandidateExport } from '@tt/domain';
import type { ApplicationRepository, CandidateNoteRepository, CvExtractionRepository } from '../../candidate-ports.js';
import type { FeedbackRecords } from '../../feedback-ports.js';
import type { FileStorage } from '../../intake-ports.js';
import type { JobRepository } from '../../job-ports.js';
import type { MessageRepository } from '../../messaging-ports.js';
import { sequential } from '../../sequential.js';

export interface ExportFile {
  /** Path inside the ZIP, as referenced by `applications[].cv.path`. */
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface CandidateExportBundle {
  readonly json: CandidateExport;
  readonly files: readonly ExportFile[];
  /** Paths of CV files that could not be read from storage: listed in `json`, absent from `files`. */
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

const iso = (date: Date): string => date.toISOString();
const isoOrNull = (date: Date | null): string | null => (date ? date.toISOString() : null);

/** `files/<applicationId>/<file name>`: unique per application, the same in the single and the organization export. */
export const cvPathOf = (application: Application): string => `files/${application.id}/${application.cv.fileName}`;

const oldestFirst = (a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

async function readFile(files: FileStorage, key: string): Promise<Uint8Array | null> {
  try {
    return await files.get(key);
  } catch {
    return null;
  }
}

/** Everything stored about one candidate, validated against the public schema, plus the original CV files. */
export async function buildCandidateExport(sources: ExportSources, candidate: Candidate, exportedAt: Date): Promise<CandidateExportBundle> {
  const { organizationId } = candidate;
  const applications = (await sources.applications.listByCandidate(organizationId, candidate.id)).toSorted(oldestFirst);
  const ids = applications.map((a) => a.id);
  const [extractions, notes] = await sequential(
    () => sources.extractions.findByApplications(organizationId, ids),
    () => sources.notes.listByCandidate(organizationId, candidate.id),
  );
  const files: ExportFile[] = [];
  const missingFiles: string[] = [];
  const exportedApplications: CandidateExport['applications'] = [];
  for (const application of applications) {
    const path = cvPathOf(application);
    const [job, messages, bytes, feedback, feedbackRequests] = await sequential(
      () => sources.jobs.findById(organizationId, application.jobId),
      () => sources.messages.listByApplication(organizationId, application.id),
      () => readFile(sources.files, application.cv.key),
      () => sources.interviewFeedback.listByApplication(organizationId, application.id),
      () => sources.feedbackRequests.listByApplication(organizationId, application.id),
    );
    if (bytes) files.push({ path, bytes });
    else missingFiles.push(path);
    const extraction = extractions.find((e) => e.applicationId === application.id) ?? null;
    exportedApplications.push({
      id: application.id,
      jobId: application.jobId,
      jobTitle: job?.content.title ?? '',
      source: application.source,
      stageId: application.stageId,
      stageChangedAt: iso(application.stageChangedAt),
      outcome: application.outcome,
      message: application.message,
      createdAt: iso(application.createdAt),
      closedAt: isoOrNull(application.closedAt),
      retentionExpiresAt: iso(application.retentionExpiresAt),
      consent: {
        status: application.consentStatus,
        privacyNoticeVersion: application.consent.privacyNoticeVersion,
        scopes: [...application.consent.scopes],
        givenAt: iso(application.consent.givenAt),
      },
      cv: { path, fileName: application.cv.fileName, mediaType: application.cv.mediaType, sizeBytes: application.cv.sizeBytes },
      extraction: extraction ? { status: extraction.status, source: extraction.source, text: extraction.text, data: extraction.data } : null,
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        status: m.status,
        subject: m.subject,
        body: m.bodyText,
        createdAt: iso(m.createdAt),
        sentAt: isoOrNull(m.sentAt),
      })),
      feedback: feedback.map((f) => ({
        id: f.id,
        stageId: f.stageId,
        interviewerName: f.interviewerName,
        answers: { ...f.answers },
        recommendation: f.recommendation,
        submittedAt: iso(f.submittedAt),
      })),
      feedbackRequests: feedbackRequests.map((r) => ({
        id: r.id,
        stageId: r.stageId,
        interviewerName: r.interviewerName,
        createdAt: iso(r.createdAt),
        expiresAt: iso(r.expiresAt),
        submittedAt: isoOrNull(r.submittedAt),
      })),
    });
  }
  const json = candidateExportSchema.parse({
    schemaVersion: 1,
    exportedAt: iso(exportedAt),
    candidate: {
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      linkedinUrl: candidate.linkedinUrl,
      tags: [...candidate.tags],
      talentPool: candidate.talentPool,
      retentionExpiresAt: iso(candidate.retentionExpiresAt),
      createdAt: iso(candidate.createdAt),
      updatedAt: iso(candidate.updatedAt),
    },
    applications: exportedApplications,
    notes: notes.toSorted(oldestFirst).map((n) => ({
      id: n.id,
      applicationId: n.applicationId,
      authorId: n.authorId,
      body: n.body,
      createdAt: iso(n.createdAt),
    })),
  });
  return { json, files, missingFiles };
}

/** `candidate.json` plus the CV files, in one archive. */
export async function zipCandidateExport(zip: { add(path: string, bytes: Uint8Array): Promise<void>; finish(): Promise<Uint8Array> }, bundle: CandidateExportBundle): Promise<Uint8Array> {
  await zip.add('candidate.json', new TextEncoder().encode(`${JSON.stringify(bundle.json, null, 2)}\n`));
  for (const file of bundle.files) await zip.add(file.path, file.bytes);
  return zip.finish();
}
