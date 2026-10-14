import { jobRequestInputSchema, JOB_REQUEST_STATUSES, type JobRequest, type PageMeta } from '@tt/domain';
import { z } from 'zod';
import { ConflictError, ValidationError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { defineJobRequestUseCase } from './define.js';
import { notifyApprovers, requireJobRequest } from './shared.js';

const target = (request: JobRequest) => ({ type: 'job_request', id: request.id });

/** Any member who can create ads asks for a position. The approvers are notified; nothing is created yet. */
export const submitJobRequest = defineJobRequestUseCase({
  name: 'submitJobRequest',
  input: jobRequestInputSchema,
  permission: 'job:create',
  audit: {
    action: 'job_request.submitted',
    target: (_input, result: JobRequest) => target(result),
    metadata: (_input, result: JobRequest) => ({ title: result.title, headcount: result.headcount }),
  },
  handler: async ({ deps, actor, input }): Promise<JobRequest> => {
    const now = deps.now();
    const request = await deps.jobRequests.create({
      ...input,
      id: deps.newId(),
      organizationId: actor.organizationId,
      requestedBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
      status: 'submitted',
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      jobId: null,
      createdAt: now,
      updatedAt: now,
    });
    await notifyApprovers(deps, request);
    return request;
  },
});

/**
 * A draft that was written directly asks for approval through the same flow: the request is linked to the job and carries
 * its current budget. It needs a salary range in the draft.
 */
export const requestJobApproval = defineJobRequestUseCase({
  name: 'requestJobApproval',
  input: z.object({ jobId: z.string().min(1), reason: z.string().trim().min(1).max(4000) }),
  permission: 'job:create',
  audit: {
    action: 'job_request.submitted',
    target: (_input, result: JobRequest) => target(result),
    metadata: (input, result: JobRequest) => ({ title: result.title, jobId: input.jobId }),
  },
  handler: async ({ deps, actor, input }): Promise<JobRequest> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    if (job.status !== 'draft') throw new ConflictError('Only a draft needs approval.');
    const { salary } = job.content;
    if (salary.min === undefined || salary.max === undefined) {
      throw new ValidationError([{ path: 'salary', message: 'required' }]);
    }
    if (await deps.jobRequests.findOpenForJob(actor.organizationId, job.id)) throw new ConflictError('approval_already_requested');
    const now = deps.now();
    const content = job.content;
    const request = await deps.jobRequests.create({
      id: deps.newId(),
      organizationId: actor.organizationId,
      requestedBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
      title: content.title,
      ...(content.role === undefined ? {} : { role: content.role }),
      ...(content.seniority === undefined ? {} : { seniority: content.seniority }),
      reason: input.reason,
      headcount: 1,
      salaryMin: salary.min,
      salaryMax: salary.max,
      currency: salary.currency,
      ...(content.workMode === undefined ? {} : { workMode: content.workMode }),
      location: content.location,
      processNotes: '',
      interviewersNotes: '',
      language: content.language,
      status: 'submitted',
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      jobId: job.id,
      createdAt: now,
      updatedAt: now,
    });
    await notifyApprovers(deps, request);
    return request;
  },
});

export const listJobRequests = defineJobRequestUseCase({
  name: 'listJobRequests',
  input: z.object({
    status: z.enum(JOB_REQUEST_STATUSES).optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  permission: 'job:read',
  audit: { skip: 'read-only list of requests, no candidate data' },
  handler: async ({ deps, actor, input }): Promise<{ readonly items: readonly JobRequest[]; readonly meta: PageMeta }> => {
    const { items, total } = await deps.jobRequests.list({ organizationId: actor.organizationId, ...input });
    return { items, meta: { total, page: input.page, limit: input.limit } };
  },
});

export const getJobRequest = defineJobRequestUseCase({
  name: 'getJobRequest',
  input: z.object({ requestId: z.string().min(1) }),
  permission: 'job:read',
  audit: { skip: 'read-only, no candidate data' },
  handler: ({ deps, actor, input }) => requireJobRequest(deps, actor.organizationId, input.requestId),
});
