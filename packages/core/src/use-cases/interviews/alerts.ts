import type { Interview } from '@candydati/domain';
import type { InterviewDeps } from '../../interview-ports.js';
import { enqueueAutomations } from '../automations/enqueue.js';
import { memberIdsOf } from './shared.js';

export type InterviewChange = 'booked' | 'rescheduled' | 'cancelled';

type AlertDeps = Pick<InterviewDeps, 'notifications' | 'queue' | 'newId' | 'now'> & Partial<Pick<InterviewDeps, 'transaction'>>;

/**
 * Inside the transaction of the change: an in-app notification for the interviewers and the person who proposed it
 * (never for whoever made the change), and the automations of the interview's stage (`interview_booked` once per
 * interview, `interview_cancelled`). The payload carries ids and the time only: no names.
 */
export async function announceInterviewChange(deps: AlertDeps, interview: Interview, change: InterviewChange, by: string, applicationOpen: boolean): Promise<void> {
  const people = [...new Set([interview.proposedBy, ...memberIdsOf(interview)])].filter((userId) => userId !== by && userId !== 'system');
  const kind = change === 'cancelled' ? 'interview_cancelled' : 'interview_booked';
  for (const userId of people) {
    await deps.notifications.createIfAbsent(
      {
        id: deps.newId(),
        organizationId: interview.organizationId,
        userId,
        kind,
        applicationId: interview.applicationId,
        jobId: interview.jobId,
        taskId: null,
        payload: { interviewId: interview.id, stageId: interview.stageId, startsAt: interview.startsAt?.toISOString() ?? null, rescheduled: change === 'rescheduled', byCandidate: by === 'candidate' },
        createdAt: deps.now(),
        readAt: null,
      },
      `${kind}:${interview.id}:${interview.icsSequence}:${change}`,
    );
  }
  if (!applicationOpen || change === 'rescheduled') return;
  const occurrence = change === 'booked' ? `interview:${interview.id}` : `interview-cancelled:${interview.id}`;
  await enqueueAutomations(deps, interview.organizationId, interview.applicationId, interview.stageId, { trigger: change === 'booked' ? 'interview_booked' : 'interview_cancelled', occurrence });
}
