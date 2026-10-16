import type { Application, ApplicationAttachment, Candidate, CandidateExport, CandidateNote, CvExtractionRecord, Job, Message } from '@candydati/domain';
import type { FeedbackRecords } from '../../feedback-ports.js';

type Records<K extends keyof FeedbackRecords> = Awaited<ReturnType<FeedbackRecords[K]['listByApplication']>>;

export const iso = (date: Date): string => date.toISOString();
const isoOrNull = (date: Date | null): string | null => (date ? date.toISOString() : null);

/**
 * `files/<applicationId>/<file name>`: unique per application, the same in the single and the organization export.
 * null for a migrated application that came without a CV.
 */
export const cvPathOf = (application: Application): string | null => (application.cv ? `files/${application.id}/${application.cv.fileName}` : null);

/** `files/<applicationId>/attachments/<attachmentId>/<file name>`: unique, next to the application's CV. */
export const attachmentPathOf = (attachment: ApplicationAttachment): string => `files/${attachment.applicationId}/attachments/${attachment.id}/${attachment.fileName}`;

export const oldestFirst = (a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

export interface ApplicationParts {
  readonly application: Application;
  readonly path: string | null;
  readonly job: Job | null;
  readonly extraction: CvExtractionRecord | null;
  readonly messages: readonly Message[];
  readonly feedback: Records<'interviewFeedback'>;
  readonly feedbackRequests: Records<'feedbackRequests'>;
  readonly attachments: readonly ApplicationAttachment[];
}

type ExportedApplication = CandidateExport['applications'][number];

const exportMessage = (m: Message): ExportedApplication['messages'][number] => ({
  id: m.id,
  direction: m.direction,
  status: m.status,
  subject: m.subject,
  body: m.bodyText,
  createdAt: iso(m.createdAt),
  sentAt: isoOrNull(m.sentAt),
});

const exportAttachment = (a: ApplicationAttachment): NonNullable<ExportedApplication['attachments']>[number] => ({
  id: a.id,
  kind: a.kind,
  path: attachmentPathOf(a),
  fileName: a.fileName,
  mediaType: a.mediaType,
  sizeBytes: a.sizeBytes,
  createdAt: iso(a.createdAt),
});

/** One application in the shape of the public export schema. */
export function exportApplication({ application, path, job, extraction, messages, feedback, feedbackRequests, attachments }: ApplicationParts): CandidateExport['applications'][number] {
  return {
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
    cv: application.cv && path ? { path, fileName: application.cv.fileName, mediaType: application.cv.mediaType, sizeBytes: application.cv.sizeBytes } : null,
    extraction: extraction ? { status: extraction.status, source: extraction.source, text: extraction.text, data: extraction.data } : null,
    messages: messages.map(exportMessage),
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
    attachments: attachments.map(exportAttachment),
    answers: (application.answers ?? []).map(({ question, answer }) => ({ question, answer })),
  };
}

export const exportCandidate = (candidate: Candidate): CandidateExport['candidate'] => ({
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
});

export const exportNotes = (notes: readonly CandidateNote[]): CandidateExport['notes'] =>
  notes.toSorted(oldestFirst).map((n) => ({ id: n.id, applicationId: n.applicationId, authorId: n.authorId, body: n.body, createdAt: iso(n.createdAt) }));
