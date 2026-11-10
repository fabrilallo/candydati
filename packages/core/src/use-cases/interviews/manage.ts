import { z } from 'zod';
import { ConflictError, NotFoundError } from '../../errors.js';
import { afterCommitOrNow } from '../../transaction.js';
import { requireApplication } from '../candidates/shared.js';
import { sendInterviewNotices } from './notices.js';
import { defineInterviewUseCase, loadInterviewContext, toInterviewView, type InterviewView } from './shared.js';

/** The interviews of an application, newest first, for whoever reads the candidate. */
export const listApplicationInterviews = defineInterviewUseCase({
  name: 'listApplicationInterviews',
  input: z.object({ applicationId: z.string().min(1) }),
  permission: 'interview:read',
  audit: { skip: 'read only' },
  handler: async ({ deps, actor, input }): Promise<readonly InterviewView[]> => {
    const application = await requireApplication(deps, actor.organizationId, input.applicationId);
    return (await deps.interviews.listByApplication(actor.organizationId, application.id)).map(toInterviewView);
  },
});

/** The recruiter withdraws a proposal or cancels a booked interview; a booked one leaves every calendar. */
export const cancelInterview = defineInterviewUseCase({
  name: 'cancelInterview',
  input: z.object({ interviewId: z.string().min(1) }),
  permission: 'interview:schedule',
  audit: {
    action: 'interview.cancelled',
    target: (input) => ({ type: 'interview', id: input.interviewId }),
    metadata: (_input, result: InterviewView) => ({ applicationId: result.applicationId, stageId: result.stageId, by: 'organization' }),
  },
  handler: async ({ deps, actor, input }): Promise<InterviewView> => {
    const interview = await deps.interviews.findById(actor.organizationId, input.interviewId);
    if (!interview) throw new NotFoundError('Interview not found.');
    // Job access: whoever cannot reach the application does not learn the interview exists.
    await requireApplication(deps, actor.organizationId, interview.applicationId);
    if (interview.status === 'cancelled') throw new ConflictError('interview_cancelled');
    const wasBooked = interview.status === 'booked';
    const now = deps.now();
    const cancelled = await deps.interviews.update(actor.organizationId, interview.id, { statuses: [interview.status], icsSequence: interview.icsSequence }, {
      status: 'cancelled', cancelledAt: now, cancelledBy: actor.onBehalfOfUserId ?? actor.id ?? 'system', icsSequence: wasBooked ? interview.icsSequence + 1 : interview.icsSequence, updatedAt: now,
    });
    if (!cancelled) throw new ConflictError('interview_changed');
    if (wasBooked) {
      const context = await loadInterviewContext(deps, actor.organizationId, cancelled.applicationId, cancelled.stageId);
      if (context) await afterCommitOrNow(deps, async () => void (await sendInterviewNotices(deps, context, cancelled, 'cancelled', null)));
    }
    return toInterviewView(cancelled);
  },
});
