import type { AutomationRule, Notification, Role, Task } from '@tt/domain';
import type { ApplicationRepository, CandidateRepository, UserDirectory } from './candidate-ports.js';
import type { TaskQueue } from './intake-ports.js';
import type { JobRepository } from './job-ports.js';
import type { EmailTemplateRepository, MessagingDeps } from './messaging-ports.js';
import type { CoreDeps } from './ports.js';
import type { ResponsePromiseRepository } from './report-ports.js';

export interface NotificationListQuery {
  readonly organizationId: string;
  readonly userId: string;
  readonly unreadOnly: boolean;
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
  unreadCount(organizationId: string, userId: string): Promise<number>;
}

export interface TaskListQuery {
  readonly organizationId: string;
  /** Absent: tasks of every assignee in the organization. */
  readonly assigneeId?: string | undefined;
  readonly openOnly: boolean;
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
  /** Enabled rules of one stage, oldest first. */
  listEnabledByStage(organizationId: string, jobId: string, stageId: string): Promise<readonly AutomationRule[]>;
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
  readonly newId: () => string;
  readonly now: () => Date;
}

/** The scan is a system job over every organization: no actor, so no audit log either. */
export interface ScanDeps {
  readonly applications: ApplicationRepository;
  readonly jobs: JobRepository;
  readonly tasks: TaskRepository;
  readonly notifications: NotificationRepository;
  readonly members: MemberDirectory;
  /** Overdue open promises are flipped to missed on every run. */
  readonly promises: ResponsePromiseRepository;
  readonly newId: () => string;
}

/** `runAutomations`: sends through the normal messaging path, so it needs everything messaging needs. */
export type AutomationRunDeps = MessagingDeps & {
  readonly rules: AutomationRuleRepository;
  readonly tasks: TaskRepository;
  readonly notifications: NotificationRepository;
  readonly queue: TaskQueue;
};
