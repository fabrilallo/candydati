import type {
  Candidate,
  ConsentScope,
  CvExtraction,
  ExtractionStatus,
  JobStatus,
  Outcome,
  PipelineStage,
  PrivacyNotice,
  SelectionStage,
} from '@tt/domain';
import type { CandidateSummary } from '../candidate-ports.js';
import type { CandidatePage } from '../use-cases/candidates/search-candidates.js';
import type { ApplicationCardView, CandidateDetailView, NoteView, PipelineView } from '../use-cases/candidates/views.js';

const iso = (date: Date): string => date.toISOString();
const isoOrNull = (date: Date | null): string | null => (date ? date.toISOString() : null);

export interface PrivacyNoticeDto {
  readonly id: string;
  readonly version: number;
  readonly language: PrivacyNotice['language'];
  readonly text: string;
  readonly contactEmail: string;
  readonly retentionDays: PrivacyNotice['retentionDays'];
  readonly createdAt: string;
}

/** What the careers page shows next to the form: no id of the organization, no author. */
export interface PublicPrivacyNoticeDto {
  readonly version: number;
  readonly language: PrivacyNotice['language'];
  readonly text: string;
  readonly contactEmail: string;
  readonly retentionDays: PrivacyNotice['retentionDays'];
}

export interface ApplicationCardDto {
  readonly id: string;
  readonly jobId: string;
  readonly stageId: string;
  readonly outcome: Outcome | null;
  readonly createdAt: string;
  readonly stageChangedAt: string;
  readonly closedAt: string | null;
  readonly noteCount: number;
  /** True when the stage no longer exists in the job's process: show "stage removed". */
  readonly stageRemoved: boolean;
  readonly candidate: {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly tags: readonly string[];
    readonly headline: string | null;
    readonly location: string | null;
    readonly yearsOfExperience: number | null;
  };
}

export interface PipelineDto {
  readonly job: { readonly id: string; readonly title: string; readonly status: JobStatus };
  readonly stages: readonly { readonly id: string; readonly declared: SelectionStage | null; readonly count: number }[];
  readonly applications: readonly ApplicationCardDto[];
}

export interface CandidateSummaryDto {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly tags: readonly string[];
  readonly talentPool: boolean;
  readonly applicationCount: number;
  readonly lastAppliedAt: string | null;
  readonly retentionExpiresAt: string;
}

export interface NoteDto {
  readonly id: string;
  readonly applicationId: string | null;
  readonly author: { readonly id: string; readonly name: string };
  readonly body: string;
  readonly createdAt: string;
}

export interface CandidateDetailDto {
  readonly candidate: {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly phone: string | null;
    readonly linkedinUrl: string | null;
    readonly tags: readonly string[];
    readonly talentPool: boolean;
    readonly retentionExpiresAt: string;
    readonly createdAt: string;
  };
  readonly applications: readonly {
    readonly id: string;
    readonly job: { readonly id: string; readonly title: string; readonly slug: string };
    readonly stageId: string;
    readonly stageRemoved: boolean;
    readonly stages: readonly { readonly id: string; readonly declared: SelectionStage | null }[];
    readonly outcome: Outcome | null;
    readonly message: string;
    readonly createdAt: string;
    readonly stageChangedAt: string;
    readonly closedAt: string | null;
    readonly consent: { readonly privacyNoticeVersion: number; readonly scopes: readonly ConsentScope[]; readonly givenAt: string };
    readonly retentionExpiresAt: string;
    readonly cv: { readonly fileName: string; readonly mediaType: string; readonly sizeBytes: number };
    readonly extraction: { readonly status: ExtractionStatus; readonly data: CvExtraction | null; readonly source: 'model' | 'text' | null };
    /** Messages in the conversation of this application (sent, received and failed). */
    readonly messageCount: number;
  }[];
  readonly notes: readonly NoteDto[];
}

export const toPrivacyNoticeDto = (notice: PrivacyNotice): PrivacyNoticeDto => ({
  id: notice.id,
  version: notice.version,
  language: notice.language,
  text: notice.text,
  contactEmail: notice.contactEmail,
  retentionDays: notice.retentionDays,
  createdAt: iso(notice.createdAt),
});

export const toPublicPrivacyNoticeDto = (notice: PrivacyNotice): PublicPrivacyNoticeDto => ({
  version: notice.version,
  language: notice.language,
  text: notice.text,
  contactEmail: notice.contactEmail,
  retentionDays: notice.retentionDays,
});

export const toApplicationCardDto = (view: ApplicationCardView): ApplicationCardDto => {
  const { application, candidate, extraction } = view;
  return {
    id: application.id,
    jobId: application.jobId,
    stageId: application.stageId,
    outcome: application.outcome,
    createdAt: iso(application.createdAt),
    stageChangedAt: iso(application.stageChangedAt),
    closedAt: isoOrNull(application.closedAt),
    noteCount: view.noteCount,
    stageRemoved: view.stageRemoved,
    candidate: {
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      tags: candidate.tags,
      headline: extraction?.data?.headline ?? null,
      location: extraction?.data?.location ?? null,
      yearsOfExperience: extraction?.data?.yearsOfExperience ?? null,
    },
  };
};

const toStageDto = (stage: PipelineStage) => ({ id: stage.id, declared: stage.declared });

export const toPipelineDto = (view: PipelineView): PipelineDto => ({
  job: { id: view.job.id, title: view.job.content.title, status: view.job.status },
  stages: view.stages.map(({ stage, count }) => ({ ...toStageDto(stage), count })),
  applications: view.cards.map(toApplicationCardDto),
});

export const toCandidateSummaryDto = ({ candidate, applicationCount, lastAppliedAt }: CandidateSummary): CandidateSummaryDto => ({
  id: candidate.id,
  firstName: candidate.firstName,
  lastName: candidate.lastName,
  email: candidate.email,
  tags: candidate.tags,
  talentPool: candidate.talentPool,
  applicationCount,
  lastAppliedAt: isoOrNull(lastAppliedAt),
  retentionExpiresAt: iso(candidate.retentionExpiresAt),
});

export const toCandidateSummaryDtos = (page: CandidatePage): readonly CandidateSummaryDto[] => page.items.map(toCandidateSummaryDto);

export const toNoteDto = ({ note, authorName }: NoteView): NoteDto => ({
  id: note.id,
  applicationId: note.applicationId,
  author: { id: note.authorId, name: authorName },
  body: note.body,
  createdAt: iso(note.createdAt),
});

const toCandidateDto = (candidate: Candidate): CandidateDetailDto['candidate'] => ({
  id: candidate.id,
  firstName: candidate.firstName,
  lastName: candidate.lastName,
  email: candidate.email,
  phone: candidate.phone,
  linkedinUrl: candidate.linkedinUrl,
  tags: candidate.tags,
  talentPool: candidate.talentPool,
  retentionExpiresAt: iso(candidate.retentionExpiresAt),
  createdAt: iso(candidate.createdAt),
});

export const toCandidateDetailDto = (view: CandidateDetailView): CandidateDetailDto => ({
  candidate: toCandidateDto(view.candidate),
  applications: view.applications.map(({ application, job, stages, extraction, messageCount }) => ({
    id: application.id,
    job: { id: job.id, title: job.content.title, slug: job.slug },
    stageId: application.stageId,
    stageRemoved: !stages.some((stage) => stage.id === application.stageId),
    stages: stages.map(toStageDto),
    outcome: application.outcome,
    message: application.message,
    createdAt: iso(application.createdAt),
    stageChangedAt: iso(application.stageChangedAt),
    closedAt: isoOrNull(application.closedAt),
    consent: {
      privacyNoticeVersion: application.consent.privacyNoticeVersion,
      scopes: application.consent.scopes,
      givenAt: iso(application.consent.givenAt),
    },
    retentionExpiresAt: iso(application.retentionExpiresAt),
    cv: { fileName: application.cv.fileName, mediaType: application.cv.mediaType, sizeBytes: application.cv.sizeBytes },
    extraction: { status: extraction?.status ?? 'pending', data: extraction?.data ?? null, source: extraction?.source ?? null },
    messageCount,
  })),
  notes: view.notes.map(toNoteDto),
});
