import type { AutomationRuleRepository, NotificationRepository, TaskRepository } from '../automation-ports.js';
import { NotFoundError } from '../errors.js';
import type { FeedbackRequestRepository, InterviewFeedbackRepository, StageInterviewerRepository } from '../feedback-ports.js';
import type { ImportBatchRepository } from '../import-ports.js';
import type { ConversationRepository, MessageRepository } from '../messaging-ports.js';
import type { ReportRepository, ResponsePromiseRepository, StageEventRepository } from '../report-ports.js';
import type { JobScopeContext } from './job-scope.js';

/**
 * Everything written about an application (messages, feedback, tasks, history) follows the application's job. Methods
 * the public surfaces and the system jobs use (tokens, deliveries, cross-organization scans) pass through: they never
 * run for a scoped actor. Writes guarded here fail as "not found", like a missing row.
 */
const notFound = (what: string): never => {
  throw new NotFoundError(`${what} not found.`);
};

const hasApplication = async (ctx: JobScopeContext, applicationId: string): Promise<boolean> => (await ctx.applicationsIn([applicationId])).length > 0;

export function scopeMessages(raw: MessageRepository, ctx: JobScopeContext): MessageRepository {
  const one = async <T extends { readonly applicationId: string }>(row: T | null): Promise<T | null> =>
    row && (await hasApplication(ctx, row.applicationId)) ? row : null;
  return {
    ...raw,
    async create(message) {
      if (!(await hasApplication(ctx, message.applicationId))) notFound('Application');
      return raw.create(message);
    },
    findById: async (organizationId, id) => one(await raw.findById(organizationId, id)),
    findByInboundMessageId: async (organizationId, inboundMessageId) => one(await raw.findByInboundMessageId(organizationId, inboundMessageId)),
    listByApplication: async (organizationId, applicationId) => ((await hasApplication(ctx, applicationId)) ? raw.listByApplication(organizationId, applicationId) : []),
    countByApplication: async (organizationId, applicationIds) => raw.countByApplication(organizationId, await ctx.applicationsIn(applicationIds)),
  };
}

export function scopeConversations(raw: ConversationRepository, ctx: JobScopeContext): ConversationRepository {
  return {
    ...raw,
    findByApplication: async (organizationId, applicationId) => ((await hasApplication(ctx, applicationId)) ? raw.findByApplication(organizationId, applicationId) : null),
    async ensure(conversation) {
      if (!(await hasApplication(ctx, conversation.applicationId))) notFound('Application');
      return raw.ensure(conversation);
    },
  };
}

export function scopeFeedbackRequests(raw: FeedbackRequestRepository, ctx: JobScopeContext): FeedbackRequestRepository {
  return {
    ...raw,
    async create(request) {
      if (!(await ctx.allowsJob(request.jobId))) notFound('Application');
      return raw.create(request);
    },
    async findById(organizationId, id) {
      const request = await raw.findById(organizationId, id);
      return request && (await ctx.allowsJob(request.jobId)) ? request : null;
    },
    listByApplication: async (organizationId, applicationId) => ((await hasApplication(ctx, applicationId)) ? raw.listByApplication(organizationId, applicationId) : []),
  };
}

export function scopeInterviewFeedback(raw: InterviewFeedbackRepository, ctx: JobScopeContext): InterviewFeedbackRepository {
  return {
    ...raw,
    async findByRequest(organizationId, requestId) {
      const feedback = await raw.findByRequest(organizationId, requestId);
      return feedback && (await hasApplication(ctx, feedback.applicationId)) ? feedback : null;
    },
    listByApplication: async (organizationId, applicationId) => ((await hasApplication(ctx, applicationId)) ? raw.listByApplication(organizationId, applicationId) : []),
  };
}

export function scopeStageInterviewers(raw: StageInterviewerRepository, ctx: JobScopeContext): StageInterviewerRepository {
  return {
    ...raw,
    listByJob: async (organizationId, jobId) => ((await ctx.allowsJob(jobId)) ? raw.listByJob(organizationId, jobId) : []),
    listByStage: async (organizationId, jobId, stageId) => ((await ctx.allowsJob(jobId)) ? raw.listByStage(organizationId, jobId, stageId) : []),
    async replaceForJob(organizationId, jobId, interviewers) {
      if (!(await ctx.allowsJob(jobId))) notFound('Job');
      return raw.replaceForJob(organizationId, jobId, interviewers);
    },
  };
}

/** A task about no job (a personal reminder) is not candidate data: it stays visible as before. */
export function scopeTasks(raw: TaskRepository, ctx: JobScopeContext): TaskRepository {
  return {
    ...raw,
    async create(task) {
      if (task.jobId !== null && !(await ctx.allowsJob(task.jobId))) notFound('Job');
      return raw.create(task);
    },
    async save(task) {
      const current = await raw.findById(task.organizationId, task.id);
      if (!current || (current.jobId !== null && !(await ctx.allowsJob(current.jobId)))) notFound('Task');
      return raw.save(task);
    },
    async findById(organizationId, id) {
      const task = await raw.findById(organizationId, id);
      return task && (task.jobId === null || (await ctx.allowsJob(task.jobId))) ? task : null;
    },
    async list(query) {
      const jobIds = await ctx.jobIds();
      return raw.list(jobIds === null ? query : { ...query, jobIds });
    },
    listByApplication: async (organizationId, applicationId) => ((await hasApplication(ctx, applicationId)) ? raw.listByApplication(organizationId, applicationId) : []),
  };
}

/** Notifications are always the actor's own; those about a job out of scope (left the team) are hidden. */
export function scopeNotifications(raw: NotificationRepository, ctx: JobScopeContext): NotificationRepository {
  return {
    ...raw,
    async list(query) {
      const jobIds = await ctx.jobIds();
      return raw.list(jobIds === null ? query : { ...query, jobIds });
    },
    async unreadCount(organizationId, userId) {
      const jobIds = await ctx.jobIds();
      return jobIds === null ? raw.unreadCount(organizationId, userId) : raw.unreadCount(organizationId, userId, jobIds);
    },
  };
}

export function scopeReports(raw: ReportRepository, ctx: JobScopeContext): ReportRepository {
  return {
    async aggregate(query) {
      const jobIds = await ctx.jobIds();
      return raw.aggregate(jobIds === null ? query : { ...query, jobIds });
    },
    async dailyTraffic(query) {
      const jobIds = await ctx.jobIds();
      return raw.dailyTraffic(jobIds === null ? query : { ...query, jobIds });
    },
  };
}

export function scopeStageEvents(raw: StageEventRepository, ctx: JobScopeContext): StageEventRepository {
  return {
    ...raw,
    listByApplication: async (organizationId, applicationId) => ((await hasApplication(ctx, applicationId)) ? raw.listByApplication(organizationId, applicationId) : []),
  };
}

export function scopePromises(raw: ResponsePromiseRepository, ctx: JobScopeContext): ResponsePromiseRepository {
  return {
    ...raw,
    findUnanswered: async (organizationId, applicationId) => ((await hasApplication(ctx, applicationId)) ? raw.findUnanswered(organizationId, applicationId) : null),
    listByApplication: async (organizationId, applicationId) => ((await hasApplication(ctx, applicationId)) ? raw.listByApplication(organizationId, applicationId) : []),
  };
}

export function scopeAutomationRules(raw: AutomationRuleRepository, ctx: JobScopeContext): AutomationRuleRepository {
  const guard = async (jobId: string): Promise<void> => {
    if (!(await ctx.allowsJob(jobId))) notFound('Job');
  };
  return {
    ...raw,
    async create(rule) {
      await guard(rule.jobId);
      return raw.create(rule);
    },
    async save(rule) {
      await guard(rule.jobId);
      return raw.save(rule);
    },
    async findById(organizationId, id) {
      const rule = await raw.findById(organizationId, id);
      return rule && (await ctx.allowsJob(rule.jobId)) ? rule : null;
    },
    listByJob: async (organizationId, jobId) => ((await ctx.allowsJob(jobId)) ? raw.listByJob(organizationId, jobId) : []),
    listEnabledByStage: async (organizationId, jobId, stageId) => ((await ctx.allowsJob(jobId)) ? raw.listEnabledByStage(organizationId, jobId, stageId) : []),
    async delete(organizationId, id) {
      const rule = await raw.findById(organizationId, id);
      if (!rule || !(await ctx.allowsJob(rule.jobId))) return false;
      return raw.delete(organizationId, id);
    },
    async deleteByStages(organizationId, jobId, stageIds) {
      await guard(jobId);
      return raw.deleteByStages(organizationId, jobId, stageIds);
    },
  };
}

/** An import targets one job: its batch, items and people are visible only with that job. */
export function scopeImports(raw: ImportBatchRepository, ctx: JobScopeContext): ImportBatchRepository {
  return {
    ...raw,
    async create(batch) {
      if (!(await ctx.allowsJob(batch.jobId))) notFound('Job');
      return raw.create(batch);
    },
    async findById(organizationId, id) {
      const batch = await raw.findById(organizationId, id);
      return batch && (await ctx.allowsJob(batch.jobId)) ? batch : null;
    },
    async lock(organizationId, id) {
      const batch = await raw.lock(organizationId, id);
      return batch && (await ctx.allowsJob(batch.jobId)) ? batch : null;
    },
    async list(organizationId) {
      const batches = await raw.list(organizationId);
      const jobIds = await ctx.jobIds();
      return jobIds === null ? batches : batches.filter((batch) => jobIds.includes(batch.jobId));
    },
  };
}
