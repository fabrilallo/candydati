import type { BusyInterval, Interview, InterviewStatus } from '@candydati/domain';
import type { CalendarDeps } from './calendar-ports.js';
import type { FeedbackDeps } from './feedback-ports.js';
import type { MessagingDeps } from './messaging-ports.js';
import type { NotificationRepository } from './automation-ports.js';

export type InterviewPatch = Partial<Pick<Interview, 'status' | 'startsAt' | 'endsAt' | 'icsSequence' | 'bookedAt' | 'cancelledAt' | 'cancelledBy' | 'reminderSentAt' | 'tokenHash' | 'tokenExpiresAt' | 'updatedAt'>>;

/** What a guarded change expects to find: another change got there first otherwise, and nothing is written. */
export interface InterviewExpectation {
  readonly statuses: readonly InterviewStatus[];
  readonly icsSequence: number;
}

/** Every method takes the organization, except the lookup by the hash of the secret (the secret says which one). */
export interface InterviewRepository {
  /** @throws ConflictError `interview_open` when the application already has an open interview at that stage. */
  create(interview: Interview): Promise<Interview>;
  findById(organizationId: string, id: string): Promise<Interview | null>;
  findByTokenHash(tokenHash: string): Promise<Interview | null>;
  /** Newest first. */
  listByApplication(organizationId: string, applicationId: string): Promise<readonly Interview[]>;
  /** Booked interviews of these members overlapping the window, by user id: they are busy then too. */
  bookedBusy(organizationId: string, userIds: readonly string[], window: { readonly from: Date; readonly to: Date }, exceptInterviewId?: string): Promise<ReadonlyMap<string, readonly BusyInterval[]>>;
  /** Null when the interview is not as expected any more. */
  update(organizationId: string, id: string, expected: InterviewExpectation, patch: InterviewPatch): Promise<Interview | null>;
  /**
   * Inside a transaction: serializes bookings that involve the same people until it commits, so two candidates never
   * get the same person at the same time. Locks are taken in a fixed order (no deadlock).
   */
  lockPeople(organizationId: string, userIds: readonly string[]): Promise<void>;
  /** Booked and not reminded, starting inside the window, across organizations. Only for the reminder scan. */
  listToRemind(window: { readonly from: Date; readonly to: Date }): Promise<readonly Interview[]>;
}

/** Everything the interview use cases need: the feedback context (stages, interviewers), messaging and calendars. */
export type InterviewDeps = Pick<FeedbackDeps, 'auditLog' | 'transaction' | 'jobTeams' | 'jobs' | 'candidates' | 'applications' | 'organizations' | 'members' | 'stageInterviewers' | 'sender' | 'config' | 'hash' | 'newId' | 'now' | 'onError'> &
  Pick<MessagingDeps, 'conversations' | 'messages' | 'queue' | 'newToken'> &
  Pick<CalendarDeps, 'calendarFeeds' | 'calendarReader' | 'calendarSecrets'> & {
    readonly interviews: InterviewRepository;
    /** Interviewers and the proposer learn in the app when a candidate books, moves or cancels. */
    readonly notifications: NotificationRepository;
  };

/** What the delivery needs to put a fresh link into an interview invitation at send time. */
export interface InterviewLinkDeps {
  readonly interviews: Pick<InterviewRepository, 'findById' | 'update'>;
  readonly newSecret: () => string;
  readonly hash: (secret: string) => string;
}
