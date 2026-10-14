import type { Application, Candidate, CandidateExport, CandidateNote, CvExtractionRecord, Job, Message } from '@tt/domain';
import type { FeedbackRecords } from '../../feedback-ports.js';

type Records<K extends keyof FeedbackRecords> = Awaited<ReturnType<FeedbackRecords[K]['listByApplication']>>;

export const iso = (date: Date): string => date.toISOString();
const isoOrNull = (date: Date | null): string | null => (date ? date.toISOString() : null);

/** `files/<applicationId>/<file name>`: unique per application, the same in the single and the organization export. */
export const cvPathOf = (application: Application): string => `files/${application.id}/${application.cv.fileName}`;

export const oldestFirst = (a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

export interface ApplicationParts {
  readonly application: Application;
  readonly path: string;
  readonly job: Job | null;
  readonly extraction: CvExtractionRecord | null;
  readonly messages: readonly Message[];
  readonly feedback: Records<'interviewFeedback'>;
  readonly feedbackRequests: Records<'feedbackRequests'>;
}

/** One application in the shape of the public export schema. */
export function exportApplication({ application, path, job, extraction, messages, feedback, feedbackRequests }: ApplicationParts): CandidateExport['applications'][number] {
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
