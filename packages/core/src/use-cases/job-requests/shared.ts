import { type JobRequest, type Notification, type NotificationKind } from '@candydati/domain';
import { NotFoundError } from '../../errors.js';
import type { JobRequestDeps } from '../../job-request-ports.js';

const APPROVER_ROLES = ['owner', 'admin'];

export async function requireJobRequest(deps: Pick<JobRequestDeps, 'jobRequests'>, organizationId: string, id: string): Promise<JobRequest> {
  const request = await deps.jobRequests.findById(organizationId, id);
  if (!request) throw new NotFoundError('Request not found.');
  return request;
}

async function notify(
  deps: Pick<JobRequestDeps, 'notifications' | 'newId' | 'now'>,
  request: JobRequest,
  userId: string,
  kind: NotificationKind,
  dedupeKey: string,
): Promise<void> {
  const notification: Notification = {
    id: deps.newId(),
    organizationId: request.organizationId,
    userId,
    kind,
    applicationId: null,
    jobId: request.jobId,
    taskId: null,
    payload: { requestId: request.id, status: request.status },
    createdAt: deps.now(),
    readAt: null,
  };
  await deps.notifications.createIfAbsent(notification, dedupeKey);
}

/** Owners and admins, except the person who made the request. Notifications are best effort: they never fail the action. */
export async function notifyApprovers(deps: JobRequestDeps, request: JobRequest): Promise<void> {
  try {
    const members = await deps.members.list(request.organizationId);
    const approvers = members.filter((m) => m.userId !== request.requestedBy && m.roles.some((role) => APPROVER_ROLES.includes(role)));
    for (const member of approvers) await notify(deps, request, member.userId, 'job_request_submitted', `job_request_submitted:${request.id}`);
  } catch {
    // The request is stored; the approvers still see it in the list.
  }
}

/** The requester hears about the decision (unless they decided it themselves). */
export async function notifyRequester(deps: JobRequestDeps, request: JobRequest, decidedBy: string): Promise<void> {
  if (request.requestedBy === decidedBy) return;
  try {
    await notify(deps, request, request.requestedBy, 'job_request_decided', `job_request_decided:${request.id}:${request.status}`);
  } catch {
    // Same as above.
  }
}
