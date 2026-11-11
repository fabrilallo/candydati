import { z } from 'zod';
import { ForbiddenError } from '../../errors.js';
import { participantsOf, requireContext } from './propose.js';
import { defineInterviewUseCase } from './shared.js';
import { videoRoomOf, type DefaultVideoRoom } from './video-room-of.js';

const input = z.object({ applicationId: z.string().min(1), stageId: z.string().min(1) }).strict();

/** What the proposal dialog shows before anything is sent: who takes part, and the link a video interview would get. */
export interface InterviewDefaults {
  readonly interviewers: readonly string[];
  readonly videoRoom: DefaultVideoRoom | null;
}

export const getInterviewDefaults = defineInterviewUseCase({
  name: 'getInterviewDefaults',
  input,
  permission: 'interview:schedule',
  audit: { skip: 'read of the stage’s interviewers and their rooms, before a proposal' },
  handler: async ({ deps, actor, input }): Promise<InterviewDefaults> => {
    if (actor.type === 'agent') throw new ForbiddenError('The assistant never proposes interviews.');
    const context = await requireContext(deps, actor.organizationId, input.applicationId, input.stageId);
    const interviewers = await participantsOf(deps, context, undefined);
    return { interviewers: interviewers.map((person) => person.name), videoRoom: await videoRoomOf(deps, actor.organizationId, interviewers) };
  },
});
