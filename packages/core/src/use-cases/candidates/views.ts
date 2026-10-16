import type { ApplicationTimelineDto, Application, ApplicationAttachment, AttachmentMediaType, Candidate, CandidateNote, CvExtractionRecord, CvMediaType, Job, PipelineStage, ResponseState } from '@candydati/domain';

/** What the use cases return: domain objects. The mappers in `mappers/candidate-dto.ts` turn them into DTOs. */
export interface ApplicationCardView {
  readonly application: Application;
  readonly candidate: Candidate;
  readonly extraction: CvExtractionRecord | null;
  readonly noteCount: number;
  /** The stage of the application is no longer in the job's process (it was removed after the decision). */
  readonly stageRemoved: boolean;
  /** At the time the view was built. */
  readonly responseState: ResponseState;
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
  readonly messageCount: number;
  readonly responseState: ResponseState;
  /** Files of the application other than its CV, oldest first. */
  readonly attachments: readonly ApplicationAttachment[];
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

type WithDate<T> = T extends unknown ? Omit<T, 'at'> & { readonly at: Date } : never;

/** One entry of the timeline of an application; the mapper turns `at` into an ISO string. */
export type TimelineItemView = WithDate<ApplicationTimelineDto['items'][number]>;

export interface ApplicationTimelineView {
  /** Oldest first. */
  readonly items: readonly TimelineItemView[];
}

export interface AttachmentFile {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mediaType: AttachmentMediaType;
}
