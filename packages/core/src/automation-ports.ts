import type { JobTeamRepository } from './job-team-ports.js';
import type { AutomationRule, AutomationTriggerType, Notification, NotificationKind, Role, Task } from '@candydati/domain';
import type { ApplicationRepository, CandidateRepository, UserDirectory } from './candidate-ports.js';
import type { TaskQueue } from './intake-ports.js';
import type { FeedbackStageEntryParts } from './feedback-ports.js';
import type { JobRepository, JobTemplateRepository } from './job-ports.js';
import type { EmailTemplateRepository, MessagingDeps } from './messaging-ports.js';
import type { CoreDeps } from './ports.js';
import type { MoveProposalRepository, TemplateAutomationRepository } from './proposal-ports.js';
import type { ResponsePromiseRepository } from './report-ports.js';
import type { OutboxRepository } from './webhook-ports.js';

export interface NotificationListQuery {
  readonly organizationId: string;
  readonly userId: string;
  readonly unreadOnly: boolean;
  /** Only notifications about no job or about one of these jobs (per-job access). Absent: no job filter. */
  readonly jobIds?: readonly string[] | undefined;
  /** 1-based. */
  readonly page: number;
  readonly limit: number;
}

/** Every method takes the organization and, for reads and updates, the user: nobody reads someone else's notifications. */
export interface NotificationRepository {
  /**
   * Stores the notification unless `(organization, user, dedupeKey)` already exists. Returns the stored one, or null
   * when it was a duplicate: this is what keeps the hourly scan from repeating itself.
   */
  createIfAbsent(notification: Notification, dedupeKey: string): Promise<Notification | null>;
  /** Newest first. */
  list(query: NotificationListQuery): Promise<{ readonly items: readonly Notification[]; readonly total: number }>;
  /** Marks as read (only the user's own, only the unread ones); `ids` undefined means all. Returns how many changed. */
  markRead(organizationId: string, userId: string, ids: readonly string[] | undefined, at: Date): Promise<number>;
  /** `jobIds` as in `NotificationListQuery`. */
  unreadCount(organizationId: string, userId: string, jobIds?: readonly string[]): Promise<number>;
  /**
   * Notifications of these kinds created since `since` that no digest email carried yet (`emailed_at` null), across
   * organizations. The digest is built from these, so a crash after the insert loses nothing.
   */
  listUnemailed(kinds: readonly NotificationKind[], since: Date): Promise<readonly Notification[]>;
  /**
   * Marks notifications of one organization as emailed, only those not marked yet. Returns their ids: inside a
   * transaction this is the claim of a digest, so two runs never email the same notification.
   */
  markEmailed(organizationId: string, ids: readonly string[], at: Date): Promise<readonly string[]>;
}

export interface TaskListQuery {
  readonly organizationId: string;
  /** Absent: tasks of every assignee in the organization. */
  readonly assigneeId?: string | undefined;
  readonly openOnly: boolean;
  /** Only tasks about no job or about one of these jobs (per-job access). Absent: no job filter. */
  readonly jobIds?: readonly string[] | undefined;
  readonly limit: number;
}

export interface TaskRepository {
  create(task: Task): Promise<Task>;
  /** Full replace by (organizationId, id). */
  save(task: Task): Promise<Task>;
  findById(organizationId: string, id: string): Promise<Task | null>;
  /** Open first, then by due date (no date last), then newest. */
  list(query: TaskListQuery): Promise<readonly Task[]>;
  listByApplication(organizationId: string, applicationId: string): Promise<readonly Task[]>;
  /** Open tasks due at or before `dueBefore`, across organizations. Only for the system scan. */
  listOpenDueAcrossOrganizations(dueBefore: Date): Promise<readonly Task[]>;
}

export interface AutomationRuleRepository {
  create(rule: AutomationRule): Promise<AutomationRule>;
  /** Full replace by (organizationId, id). */
  save(rule: AutomationRule): Promise<AutomationRule>;
  findById(organizationId: string, id: string): Promise<AutomationRule | null>;
  /** Oldest first. */
  listByJob(organizationId: string, jobId: string): Promise<readonly AutomationRule[]>;
  /** Enabled rules of one stage with this trigger, oldest first. */
  listEnabledByStage(organizationId: string, jobId: string, stageId: string, trigger: AutomationTriggerType): Promise<readonly AutomationRule[]>;
  /** Enabled rules with a time-based trigger (`TIME_BASED_TRIGGERS`), across organizations. Only for the system scan. */
  listEnabledTimeBasedAcrossOrganizations(): Promise<readonly AutomationRule[]>;
  /** True when a rule was deleted. */
  delete(organizationId: string, id: string): Promise<boolean>;
  /** Removes the rules of the given stages (a stage was removed from the job). Returns how many. */
  deleteByStages(organizationId: string, jobId: string, stageIds: readonly string[]): Promise<number>;
}

export interface Member {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  /** Better Auth may store several roles in one string; these are already split. */
  readonly roles: readonly (Role | string)[];
}

/** Who is in an organization: recipients of notifications and digests. */
export interface MemberDirectory {
  list(organizationId: string): Promise<readonly Member[]>;
}

export interface NotificationDeps extends CoreDeps {
  readonly notifications: NotificationRepository;
  readonly applications: ApplicationRepository;
  readonly candidates: CandidateRepository;
  readonly jobs: JobRepository;
  readonly now: () => Date;
}

export interface TaskDeps extends CoreDeps {
  readonly tasks: TaskRepository;
  readonly notifications: NotificationRepository;
  readonly applications: ApplicationRepository;
  readonly candidates: CandidateRepository;
  readonly jobs: JobRepository;
  readonly users: UserDirectory;
  readonly newId: () => string;
  readonly now: () => Date;
}

export interface AutomationRuleDeps extends CoreDeps {
  readonly rules: AutomationRuleRepository;
  readonly jobs: JobRepository;
  readonly templates: EmailTemplateRepository;
  readonly users: UserDirectory;
  /** The preview reads the open applications of the stage, their candidates and what a rule already did. */
  readonly applications: ApplicationRepository;
  readonly candidates: CandidateRepository;
  readonly executions: AutomationExecutionRepository;
  /** Copying rules to and from job templates; a template's rules are listed and removed through these too. */
  readonly jobTemplates: JobTemplateRepository;
  readonly templateAutomations: TemplateAutomationRepository;
  /** Rule creators, assignees and alert recipients must be members of the organization. */
  readonly members: MemberDirectory;
  readonly newId: () => string;
  readonly now: () => Date;
}

/** The hourly scan of time-based rules: a system job over every organization, it only queues `automation.run`. */
export interface AutomationScanDeps {
  readonly rules: AutomationRuleRepository;
  readonly applications: ApplicationRepository;
  readonly candidates: CandidateRepository;
  readonly jobs: JobRepository;
  readonly executions: AutomationExecutionRepository;
  readonly queue: TaskQueue;
  /** Open move proposals past their expiry are closed by the same hourly job. */
  readonly moveProposals: MoveProposalRepository;
}

/** The scan is a system job over every organization: no actor, so no audit log either. */
export interface ScanDeps {
  readonly applications: ApplicationRepository;
  readonly jobs: JobRepository;
  readonly tasks: TaskRepository;
  readonly notifications: NotificationRepository;
  readonly members: MemberDirectory;
  /** Job teams: a notification or digest goes only to people who can still reach the job. */
  readonly jobTeams: JobTeamRepository;
  /** Overdue open promises are flipped to missed on every run. */
  readonly promises: ResponsePromiseRepository;
  readonly newId: () => string;
}

/** One run of a rule for one occurrence of its trigger, within one entry of an application into a stage. */
export interface AutomationExecution {
  readonly id: string;
  readonly organizationId: string;
  readonly ruleId: string;
  readonly applicationId: string;
  readonly stageId: string;
  /** When the application entered the stage (`stageChangedAt`): each entry runs a rule once. */
  readonly stageEnteredAt: Date;
  /** Which occurrence of the trigger (`occurrenceOf`): `''` for the entry itself. Each occurrence runs a rule once. */
  readonly occurrence: string;
  readonly createdAt: Date;
}

export interface AutomationExecutionRepository {
  /**
   * Records the run unless this rule already ran for this entry. False when it did: the caller does nothing. Inside the
   * transaction of what the rule does, so a failed run leaves no record and is tried again.
   */
  claim(execution: AutomationExecution): Promise<boolean>;
  /** The runs of one rule for these applications (any entry, any occurrence). Empty list: nothing. */
  listByRule(organizationId: string, ruleId: string, applicationIds: readonly string[]): Promise<readonly AutomationExecution[]>;
}

/** `runAutomations`: sends through the normal messaging path, so it needs everything messaging needs. */
export type AutomationRunDeps = MessagingDeps & {
  readonly rules: AutomationRuleRepository;
  readonly executions: AutomationExecutionRepository;
  readonly tasks: TaskRepository;
  readonly notifications: NotificationRepository;
  /** The creator of a rule must still be a member, with the permission the action needs, when the rule runs. */
  readonly members: MemberDirectory;
  readonly queue: TaskQueue;
  /** `notify` with the webhook channel writes an `automation.notified` event. */
  readonly outbox: OutboxRepository;
  /** `propose_move` writes a proposal for a person to confirm or dismiss. */
  readonly moveProposals: MoveProposalRepository;
  /** `request_feedback` asks the stage's interviewers through the normal feedback flow. Absent: that action fails. */
  readonly feedback?: FeedbackStageEntryParts | undefined;
};
