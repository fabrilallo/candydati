import type { Application, Candidate, CandidateNote, CvExtractionRecord, CvMediaType, Job, PipelineStage } from '@tt/domain';

/** What the use cases return: domain objects. The mappers in `mappers/candidate-dto.ts` turn them into DTOs. */
export interface ApplicationCardView {
  readonly application: Application;
  readonly candidate: Candidate;
  readonly extraction: CvExtractionRecord | null;
  readonly noteCount: number;
}

/** `from` feeds the audit event. */
export interface MoveApplicationResult extends ApplicationCardView {
  readonly from: string;
}

export interface PipelineView {
  readonly job: Job;
  /** Open applications per stage. */
  readonly stages: readonly { readonly stage: PipelineStage; readonly count: number }[];
  /** Open and decided. */
  readonly cards: readonly ApplicationCardView[];
}

export interface CandidateApplicationView {
  readonly application: Application;
  readonly job: Job;
  readonly stages: readonly PipelineStage[];
  readonly extraction: CvExtractionRecord | null;
}

export interface NoteView {
  readonly note: CandidateNote;
  readonly authorName: string;
}

export interface CandidateDetailView {
  readonly candidate: Candidate;
  readonly applications: readonly CandidateApplicationView[];
  readonly notes: readonly NoteView[];
}

export interface CvFile {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mediaType: CvMediaType;
}
