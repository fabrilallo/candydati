import type { InterviewViewDto } from './interview-api'
import type { StageRef } from '@candydati/domain'
import { stageName } from './pipeline-board'

/** Pure: which interview the candidate header shows, so nobody has to open the Colloqui tab to know. */

const isUpcomingBooked = (interview: InterviewViewDto, now: Date): boolean =>
  interview.status === 'booked' && interview.startsAt !== null && new Date(interview.endsAt ?? interview.startsAt).getTime() > now.getTime()

/** The next booked interview not over yet; otherwise the newest proposal still waiting for the candidate. */
export const headlineInterview = (interviews: readonly InterviewViewDto[], now: Date): InterviewViewDto | null => {
  const booked = interviews.filter((interview) => isUpcomingBooked(interview, now)).toSorted((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))
  if (booked[0]) return booked[0]
  return interviews.filter((interview) => interview.status === 'proposed').toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

/** The open (proposed or booked) interview of a stage: only one at a time, so there is nothing more to propose there. */
export const openInterviewAt = (interviews: readonly InterviewViewDto[], stageId: string): InterviewViewDto | null =>
  interviews.find((interview) => interview.stageId === stageId && interview.status !== 'cancelled') ?? null

/** Pure: the stages that can have an interview (declared ones: not "received", not an outcome), with their names. */
export const declaredStages = (stages: readonly StageRef[], t: (key: string) => string): readonly { readonly id: string; readonly name: string }[] =>
  stages.filter((stage) => stage.declared !== null).map((stage) => ({ id: stage.id, name: stageName(stage, t) }))

/**
 * Pure: the stage a new proposal starts on. At an interview stage: that stage, or nothing while its interview is open
 * (the header already says so). From a stage without interviews ("Ricevute"): the first interview stage with nothing open.
 */
export const proposalStage = (stages: readonly { readonly id: string }[], currentStageId: string, interviews: readonly InterviewViewDto[]): string | null => {
  if (stages.some((stage) => stage.id === currentStageId)) return openInterviewAt(interviews, currentStageId) ? null : currentStageId
  return stages.find((stage) => openInterviewAt(interviews, stage.id) === null)?.id ?? null
}
