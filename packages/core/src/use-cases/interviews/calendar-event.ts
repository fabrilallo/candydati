import type { CalendarConnectionError, Interview } from '@candydati/domain';
import { calendarConnectionSecretContext, type CalendarConnectionRecord, type GoogleCalendarApi } from '../../calendar-connection-ports.js';
import type { InterviewDeps } from '../../interview-ports.js';
import type { RequestContext } from '../feedback/shared.js';
import type { InterviewChange } from './alerts.js';

export type CalendarEventDeps = Pick<
  InterviewDeps,
  'calendarConnections' | 'connectionSecrets' | 'googleCalendarApi' | 'interviewCalendarEvents' | 'interviews' | 'newId' | 'notifications' | 'now' | 'onError'
>;

export interface CalendarEventSync {
  /** The interview as it now is: a new booking may have got its Meet address as location. */
  readonly interview: Interview;
  /** The member whose Google Calendar already shows this change: their email goes without the .ics (no duplicate). */
  readonly inCalendarOf: string | null;
}

/** Why the interviewer's calendar was not changed: a code for the logs, never a token or what Google answered. */
export class InterviewCalendarError extends Error {
  constructor(readonly reason: CalendarConnectionError | 'unreadable_token') {
    super(`interview calendar: ${reason}`);
    this.name = 'InterviewCalendarError';
  }
}

type FailureReason = CalendarConnectionError | 'unreadable_token';

/** What the interview needed from Google when it failed: told to the people who have to act on it. */
interface Attempt {
  readonly interview: Interview;
  readonly change: InterviewChange;
  /** A video interview was waiting for its Meet: it now has no link. */
  readonly meetMissing: boolean;
}

interface Reached {
  readonly api: GoogleCalendarApi;
  readonly record: CalendarConnectionRecord;
  readonly token: string;
}

/** The person's working Google connection with its token open; null (and the connection broken) when it cannot be. */
async function reach(deps: CalendarEventDeps, api: GoogleCalendarApi, record: CalendarConnectionRecord | null, attempt: Attempt): Promise<Reached | null> {
  if (record === null || record.status !== 'active') return null;
  try {
    return { api, record, token: deps.connectionSecrets.open(record.refreshTokenCiphertext, calendarConnectionSecretContext('google', record.organizationId, record.userId)) };
  } catch {
    await failed(deps, record, 'unreadable_token', attempt);
    return null;
  }
}

async function failed(deps: CalendarEventDeps, record: CalendarConnectionRecord, reason: FailureReason, attempt: Attempt): Promise<void> {
  deps.onError?.(new InterviewCalendarError(reason));
  if (reason === 'revoked' || reason === 'unreadable_token') {
    await deps.calendarConnections.recordRefresh(record.organizationId, record.userId, 'google', { busy: record.busy, fetchedAt: deps.now(), lastError: 'revoked', status: 'broken' });
  }
  await alertFailure(deps, record.userId, reason, attempt);
}

/**
 * In the app, to who proposed the interview and to the interviewer whose calendar it is: Google did not do its part,
 * so the event (or the Meet) is missing or out of date there. Ids, time and codes only; never throws.
 */
async function alertFailure(deps: CalendarEventDeps, ownerId: string, reason: FailureReason, { interview, change, meetMissing }: Attempt): Promise<void> {
  const people = [...new Set([interview.proposedBy, ownerId])].filter((userId) => userId !== 'system');
  try {
    for (const userId of people) {
      await deps.notifications.createIfAbsent(
        {
          id: deps.newId(),
          organizationId: interview.organizationId,
          userId,
          kind: 'interview_calendar_failed',
          applicationId: interview.applicationId,
          jobId: interview.jobId,
          taskId: null,
          payload: { interviewId: interview.id, stageId: interview.stageId, startsAt: interview.startsAt?.toISOString() ?? null, change, reason, meetMissing },
          createdAt: deps.now(),
          readAt: null,
        },
        `interview_calendar_failed:${interview.id}:${interview.icsSequence}:${change}`,
      );
    }
  } catch (error) {
    deps.onError?.(error);
  }
}

/** The first member, in the stage's order, whose Google Calendar is connected and working. */
async function ownerOf(deps: CalendarEventDeps, api: GoogleCalendarApi, interview: Interview, attempt: Attempt): Promise<Reached | null> {
  const ids = interview.interviewers.flatMap((person) => (person.kind === 'member' && person.userId ? [person.userId] : []));
  const connections = await deps.calendarConnections.listByUsers(interview.organizationId, ids, 'google');
  const first = ids.map((id) => connections.find((record) => record.userId === id && record.status === 'active')).find((record) => record !== undefined);
  return reach(deps, api, first ?? null, attempt);
}

const wantsMeet = (interview: Interview): boolean => interview.mode === 'video' && interview.location === null;

async function create(deps: CalendarEventDeps, owner: Reached, context: RequestContext, interview: Interview, attempt: Attempt): Promise<CalendarEventSync> {
  const start = interview.startsAt!;
  const end = interview.endsAt!;
  const created = await owner.api.createEvent(owner.token, {
    summary: `${context.job.content.title}: ${context.stage.label} (${context.organization.name})`,
    description: `${context.candidate.firstName} ${context.candidate.lastName}`,
    start,
    end,
    location: interview.location,
    meet: attempt.meetMissing ? { requestId: `interview-${interview.id}` } : null,
  });
  if (!created.ok) {
    await failed(deps, owner.record, created.error, attempt);
    return { interview, inCalendarOf: null };
  }
  const now = deps.now();
  await deps.interviewCalendarEvents.save({
    organizationId: interview.organizationId, interviewId: interview.id, userId: owner.record.userId, provider: 'google', externalEventId: created.value.eventId, createdAt: now, updatedAt: now,
  });
  const meetUrl = attempt.meetMissing ? created.value.meetUrl : null;
  if (meetUrl === null) return { interview, inCalendarOf: owner.record.userId };
  // Guarded like every change: if the candidate moved or cancelled meanwhile, the link waits for that change.
  const withLink = await deps.interviews.update(interview.organizationId, interview.id, { statuses: ['booked'], icsSequence: interview.icsSequence }, { location: meetUrl, updatedAt: now });
  return { interview: withLink ?? interview, inCalendarOf: owner.record.userId };
}

/**
 * Keeps the interview in the interviewer's own Google Calendar: at booking an event on the first connected member's
 * calendar (with a Meet of its own for a video interview without a link), moved with the interview, deleted when it is
 * cancelled. Google sends no email; the .ics invites go as always. Never throws: Google failing never undoes a booking,
 * it only means the .ics carries the change for everyone.
 */
export async function syncInterviewEvent(deps: CalendarEventDeps, context: RequestContext, interview: Interview, change: InterviewChange): Promise<CalendarEventSync> {
  const api = deps.googleCalendarApi;
  const unchanged: CalendarEventSync = { interview, inCalendarOf: null };
  if (api === null) return unchanged;
  const attempt: Attempt = { interview, change, meetMissing: false };
  try {
    const event = await deps.interviewCalendarEvents.find(interview.organizationId, interview.id);
    if (change === 'cancelled') {
      if (event === null) return unchanged;
      await deps.interviewCalendarEvents.remove(interview.organizationId, interview.id);
      const owner = await reach(deps, api, await deps.calendarConnections.find(interview.organizationId, event.userId, 'google'), attempt);
      if (owner === null) return unchanged;
      const deleted = await api.deleteEvent(owner.token, event.externalEventId);
      if (!deleted.ok) await failed(deps, owner.record, deleted.error, attempt);
      return { interview, inCalendarOf: deleted.ok ? event.userId : null };
    }
    if (!interview.startsAt || !interview.endsAt) return unchanged;
    if (event === null) {
      const creating: Attempt = { ...attempt, meetMissing: wantsMeet(interview) };
      const owner = await ownerOf(deps, api, interview, creating);
      return owner === null ? unchanged : await create(deps, owner, context, interview, creating);
    }
    const owner = await reach(deps, api, await deps.calendarConnections.find(interview.organizationId, event.userId, 'google'), attempt);
    if (owner === null) return unchanged;
    const moved = await api.moveEvent(owner.token, event.externalEventId, { start: interview.startsAt, end: interview.endsAt });
    if (!moved.ok) {
      await failed(deps, owner.record, moved.error, attempt);
      return unchanged;
    }
    await deps.interviewCalendarEvents.save({ ...event, updatedAt: deps.now() });
    return { interview, inCalendarOf: event.userId };
  } catch (error) {
    deps.onError?.(error);
    return unchanged;
  }
}
