import type { InterviewParticipant } from '@candydati/domain';
import { z } from 'zod';
import { ForbiddenError } from '../../errors.js';
import type { InterviewDeps } from '../../interview-ports.js';
import { participantsOf, requireContext } from './propose.js';
import { defineInterviewUseCase } from './shared.js';

const input = z.object({ applicationId: z.string().min(1), stageId: z.string().min(1) }).strict();

/**
 * The interviewer in whose Google Calendar the booked interview will go, with a Meet of its own when it is a video
 * interview without a link: the first member, in the stage's order, with a working connection. Null without one.
 */
export async function meetHostOf(deps: Pick<InterviewDeps, 'calendarConnections' | 'googleCalendarApi'>, organizationId: string, interviewers: readonly InterviewParticipant[]): Promise<string | null> {
  if (deps.googleCalendarApi === null) return null;
  const members = interviewers.flatMap((person) => (person.kind === 'member' && person.userId ? [{ userId: person.userId, name: person.name }] : []));
  const connections = await deps.calendarConnections.listByUsers(organizationId, members.map((member) => member.userId), 'google');
  return members.find((member) => connections.some((record) => record.userId === member.userId && record.status === 'active'))?.name ?? null;
}

/** What the proposal dialog shows before anything is sent: who takes part, and whose calendar makes the Meet. */
export interface InterviewDefaults {
  readonly interviewers: readonly string[];
  readonly meetBy: string | null;
}

export const getInterviewDefaults = defineInterviewUseCase({
  name: 'getInterviewDefaults',
  input,
  permission: 'interview:schedule',
  audit: { skip: 'read of the stage’s interviewers and of who has a calendar connected, before a proposal' },
  handler: async ({ deps, actor, input }): Promise<InterviewDefaults> => {
    if (actor.type === 'agent') throw new ForbiddenError('The assistant never proposes interviews.');
    const context = await requireContext(deps, actor.organizationId, input.applicationId, input.stageId);
    const interviewers = await participantsOf(deps, context, undefined);
    return { interviewers: interviewers.map((person) => person.name), meetBy: await meetHostOf(deps, actor.organizationId, interviewers) };
  },
});
