import { DEFAULT_TIME_ZONE, type Interview, type InterviewMode, type InterviewStatus } from '@candydati/domain';
import { sequential } from '../../sequential.js';
import { stageContextOf, type RequestContext } from '../feedback/shared.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';
import type { InterviewDeps } from '../../interview-ports.js';
import type { z } from 'zod';

export const INTERVIEW_PAGE_ACTOR_ID = 'interview_page';
export const INTERVIEW_NOT_VALID = 'This link is not valid.';

export const defineInterviewUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<InterviewDeps, S, O>): UseCase<InterviewDeps, O> =>
  defineUseCase<InterviewDeps, S, O>(definition);

/** What the recruiter sees of an interview: never the token. */
export interface InterviewView {
  readonly id: string;
  readonly applicationId: string;
  readonly stageId: string;
  readonly status: InterviewStatus;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly durationMinutes: number;
  readonly mode: InterviewMode;
  readonly location: string | null;
  readonly interviewers: readonly { readonly kind: 'member' | 'external'; readonly userId: string | null; readonly name: string }[];
  readonly proposedBy: string;
  readonly createdAt: Date;
  readonly bookedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelledBy: string | null;
}

export const toInterviewView = (interview: Interview): InterviewView => ({
  id: interview.id,
  applicationId: interview.applicationId,
  stageId: interview.stageId,
  status: interview.status,
  startsAt: interview.startsAt,
  endsAt: interview.endsAt,
  durationMinutes: interview.durationMinutes,
  mode: interview.mode,
  location: interview.location,
  interviewers: interview.interviewers.map(({ kind, userId, name }) => ({ kind, userId, name })),
  proposedBy: interview.proposedBy,
  createdAt: interview.createdAt,
  bookedAt: interview.bookedAt,
  cancelledAt: interview.cancelledAt,
  cancelledBy: interview.cancelledBy,
});

/** Member user ids, the people whose calendars and bookings count. */
export const memberIdsOf = (interview: Pick<Interview, 'interviewers'>): readonly string[] =>
  [...new Set(interview.interviewers.flatMap((person) => (person.kind === 'member' && person.userId ? [person.userId] : [])))];

/** The zone dates are written in, in emails and for interviewers without a calendar. */
export const zoneOf = (config: { readonly timeZone?: string | undefined }): string => config.timeZone ?? DEFAULT_TIME_ZONE;

/** The application with its job, candidate, organization and stage; null when any is gone or consent is not given. */
export async function loadInterviewContext(
  deps: Pick<InterviewDeps, 'applications' | 'jobs' | 'candidates' | 'organizations'>,
  organizationId: string,
  applicationId: string,
  stageId: string,
): Promise<RequestContext | null> {
  const application = await deps.applications.findById(organizationId, applicationId);
  if (!application || application.consentStatus !== 'given') return null;
  const [job, candidate, organization] = await sequential(
    () => deps.jobs.findById(organizationId, application.jobId),
    () => deps.candidates.findById(organizationId, application.candidateId),
    () => deps.organizations.findById(organizationId),
  );
  if (!job || !candidate || !organization) return null;
  return { organization, job, application, candidate, stage: stageContextOf(job, stageId) };
}
