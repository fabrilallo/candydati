import type { FeedbackRequest, InterviewFeedback, StageInterviewer } from '@tt/domain';
import type { ApplicationRepository, CandidateRepository } from './candidate-ports.js';
import type { MemberDirectory } from './automation-ports.js';
import type { FileStorage } from './intake-ports.js';
import type { JobRepository, OrganizationDirectory } from './job-ports.js';
import type { EmailSender, MessagingConfig } from './messaging-ports.js';
import type { CoreDeps } from './ports.js';

/** Every method takes the organization: nobody reads the interviewers of another organization's job. */
export interface StageInterviewerRepository {
  /** Oldest first. */
  listByJob(organizationId: string, jobId: string): Promise<readonly StageInterviewer[]>;
  listByStage(organizationId: string, jobId: string, stageId: string): Promise<readonly StageInterviewer[]>;
  /** The given list becomes the whole configuration of the job. */
  replaceForJob(organizationId: string, jobId: string, interviewers: readonly StageInterviewer[]): Promise<void>;
}

export interface FeedbackRequestRepository {
  create(request: FeedbackRequest): Promise<FeedbackRequest>;
  /** Full replace by (organizationId, id). */
  save(request: FeedbackRequest): Promise<FeedbackRequest>;
  findById(organizationId: string, id: string): Promise<FeedbackRequest | null>;
  /** By the hash of the secret, across organizations: the secret is what says which organization the link belongs to. */
  findByTokenHash(tokenHash: string): Promise<FeedbackRequest | null>;
  /** Oldest first. */
  listByApplication(organizationId: string, applicationId: string): Promise<readonly FeedbackRequest[]>;
  /** Not submitted and not expired at `now`, across organizations. Only for the reminder scan. */
  listOpenAcrossOrganizations(now: Date): Promise<readonly FeedbackRequest[]>;
}

export interface InterviewFeedbackRepository {
  /** @throws ConflictError when the request already has its feedback: one submission per link. */
  create(feedback: InterviewFeedback): Promise<InterviewFeedback>;
  findByRequest(organizationId: string, requestId: string): Promise<InterviewFeedback | null>;
  /** Oldest first. */
  listByApplication(organizationId: string, applicationId: string): Promise<readonly InterviewFeedback[]>;
}

/** What candidate export and erasure need to find feedback. */
export interface FeedbackRecords {
  readonly feedbackRequests: FeedbackRequestRepository;
  readonly interviewFeedback: InterviewFeedbackRepository;
}

/** What sending the link needs. The email always goes out from the platform identity, never from a candidate-facing one. */
export interface FeedbackMailParts {
  readonly sender: EmailSender;
  readonly config: MessagingConfig;
  /** 24+ chars, base32 lowercase, from a CSPRNG: the secret in the link. */
  readonly newToken: () => string;
  /** One-way hash of the secret (sha256 hex). Only the hash is stored. */
  readonly hash: (secret: string) => string;
  /** Called when an email could not be sent; the request exists either way. */
  readonly onError?: (error: unknown) => void;
}

/** Everything the recruiter-facing feedback use cases and the reminder scan need. */
export interface FeedbackDeps extends CoreDeps, FeedbackRecords, FeedbackMailParts {
  readonly jobs: JobRepository;
  readonly candidates: CandidateRepository;
  readonly applications: ApplicationRepository;
  readonly organizations: OrganizationDirectory;
  readonly members: MemberDirectory;
  readonly stageInterviewers: StageInterviewerRepository;
  readonly files: FileStorage;
  readonly newId: () => string;
  readonly now: () => Date;
}

/** What `moveApplication` and `submitApplication` need to ask for feedback when an application enters a stage. */
export type FeedbackStageEntryParts = FeedbackRecords & FeedbackMailParts & Pick<FeedbackDeps, 'members' | 'organizations' | 'stageInterviewers'>;

export type FeedbackStageEntryDeps = FeedbackStageEntryParts &
  Pick<FeedbackDeps, 'auditLog' | 'jobs' | 'candidates' | 'applications' | 'newId' | 'now'>;

/** The public form: a visitor with a link, no session. */
export type PublicFeedbackDeps = FeedbackRecords &
  Pick<FeedbackDeps, 'auditLog' | 'jobs' | 'candidates' | 'applications' | 'organizations' | 'files' | 'newId' | 'hash' | 'now'>;
