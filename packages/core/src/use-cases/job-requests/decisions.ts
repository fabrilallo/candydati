import { jobContentFromRequest, jobSlug, type Job, type JobRequest } from '@tt/domain';
import { z } from 'zod';
import { toAuditActor } from '../../actor.js';
import { ConflictError, ValidationError } from '../../errors.js';
import type { JobRequestDeps } from '../../job-request-ports.js';
import { parseContent, withStageIds } from '../jobs/shared.js';
import { defineJobRequestUseCase } from './define.js';
import { notifyRequester, requireJobRequest } from './shared.js';

const SLUG_SUFFIX_LENGTH = 6;
const NOTE_MAX = 2000;
const decidedBy = (actor: { readonly onBehalfOfUserId: string | null; readonly id: string | null }): string => actor.onBehalfOfUserId ?? actor.id ?? 'system';
const target = (request: JobRequest) => ({ type: 'job_request', id: request.id });

function assertSubmitted(request: JobRequest): void {
  if (request.status !== 'submitted') throw new ConflictError(`Request is already ${request.status}.`);
}

/**
 * Owners and admins sign off the budget. A request made for an existing draft puts the approval on that job at once; a
 * request for a new position becomes convertible. The requester is notified.
 */
export const approveJobRequest = defineJobRequestUseCase({
  name: 'approveJobRequest',
  input: z.object({ requestId: z.string().min(1), note: z.string().trim().max(NOTE_MAX).optional() }),
  permission: 'job:approve',
  audit: {
    action: 'job_request.approved',
    target: (_input, result: JobRequest) => target(result),
    metadata: (_input, result: JobRequest) => ({ salaryMin: result.salaryMin, salaryMax: result.salaryMax, jobId: result.jobId }),
  },
  handler: async ({ deps, actor, input }): Promise<JobRequest> => {
    const request = await requireJobRequest(deps, actor.organizationId, input.requestId);
    assertSubmitted(request);
    const now = deps.now();
    const by = decidedBy(actor);
    const approval = { approvedBy: by, approvedAt: now, salaryMin: request.salaryMin, salaryMax: request.salaryMax, currency: request.currency };
    if (request.jobId !== null) await deps.approvals.set(actor.organizationId, request.jobId, approval);
    const saved = await deps.jobRequests.save({
      ...request,
      status: request.jobId === null ? 'approved' : 'converted',
      decidedBy: by,
      decidedAt: now,
      decisionNote: input.note ?? null,
      updatedAt: now,
    });
    await notifyRequester(deps, saved, by);
    return saved;
  },
});

/** A rejection always says why: the note is mandatory. */
export const rejectJobRequest = defineJobRequestUseCase({
  name: 'rejectJobRequest',
  input: z.object({ requestId: z.string().min(1), note: z.string().trim().min(1).max(NOTE_MAX) }),
  permission: 'job:approve',
  audit: { action: 'job_request.rejected', target: (_input, result: JobRequest) => target(result) },
  handler: async ({ deps, actor, input }): Promise<JobRequest> => {
    const request = await requireJobRequest(deps, actor.organizationId, input.requestId);
    assertSubmitted(request);
    const now = deps.now();
    const by = decidedBy(actor);
    const saved = await deps.jobRequests.save({ ...request, status: 'rejected', decidedBy: by, decidedAt: now, decisionNote: input.note, updatedAt: now });
    await notifyRequester(deps, saved, by);
    return saved;
  },
});

async function createDraft(deps: JobRequestDeps, request: JobRequest, organizationId: string): Promise<Job> {
  const content = withStageIds(parseContent(jobContentFromRequest(request)), deps.newId);
  const id = deps.newId();
  const now = deps.now();
  return deps.jobs.create({
    id,
    organizationId,
    slug: jobSlug(content.title, id.slice(0, SLUG_SUFFIX_LENGTH)),
    status: 'draft',
    content,
    quality: null,
    // The requester owns the ad: deadline and stale-ad notifications go to them.
    createdBy: request.requestedBy,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    closedAt: null,
  });
}

/**
 * Makes the draft job from a request. With approval on, only an approved request converts and the job carries the approved
 * budget; with approval off, a submitted request converts at once. Rejected, converted and draft-linked requests do not.
 */
export const convertJobRequest = defineJobRequestUseCase({
  name: 'convertJobRequest',
  input: z.object({ requestId: z.string().min(1) }),
  permission: 'job:create',
  audit: {
    action: 'job_request.converted',
    target: (input) => ({ type: 'job_request', id: input.requestId }),
    metadata: (_input, result: Job) => ({ jobId: result.id }),
  },
  handler: async ({ deps, actor, input }): Promise<Job> => {
    const request = await requireJobRequest(deps, actor.organizationId, input.requestId);
    if (request.jobId !== null || request.status === 'converted' || request.status === 'rejected') {
      throw new ConflictError(`Request is already ${request.status}.`);
    }
    const { requireApproval } = await deps.organizationSettings.get(actor.organizationId);
    if (request.status === 'submitted' && requireApproval) {
      throw new ValidationError([{ path: 'status', message: 'approval_required' }]);
    }
    const job = await createDraft(deps, request, actor.organizationId);
    const now = deps.now();
    if (request.status === 'approved' && request.decidedBy !== null && request.decidedAt !== null) {
      await deps.approvals.set(actor.organizationId, job.id, {
        approvedBy: request.decidedBy,
        approvedAt: request.decidedAt,
        salaryMin: request.salaryMin,
        salaryMax: request.salaryMax,
        currency: request.currency,
      });
    }
    await deps.jobRequests.save({ ...request, status: 'converted', jobId: job.id, updatedAt: now });
    await deps.auditLog.append({
      organizationId: actor.organizationId,
      actor: toAuditActor(actor),
      action: 'job.created',
      target: { type: 'job', id: job.id },
      metadata: { title: job.content.title, requestId: request.id },
    });
    return job;
  },
});
