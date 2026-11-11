import type { InterviewParticipant } from '@candydati/domain';
import type { InterviewDeps } from '../../interview-ports.js';

export interface DefaultVideoRoom {
  readonly url: string;
  /** The interviewer whose room it is. */
  readonly owner: string;
}

/** The room of the first interviewer (in the stage's order) who saved one; externals have none. */
export async function videoRoomOf(deps: Pick<InterviewDeps, 'videoRooms'>, organizationId: string, interviewers: readonly InterviewParticipant[]): Promise<DefaultVideoRoom | null> {
  const members = interviewers.flatMap((person) => (person.userId ? [{ userId: person.userId, name: person.name }] : []));
  const rooms = await deps.videoRooms.listByUsers(organizationId, members.map((member) => member.userId));
  const byUser = new Map(rooms.map((room) => [room.userId, room.url]));
  const first = members.find((member) => byUser.has(member.userId));
  return first ? { url: byUser.get(first.userId)!, owner: first.name } : null;
}
