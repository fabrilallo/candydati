import type { CalendarConnectionError, Interview } from '@candydati/domain';
import { calendarConnectionSecretContext, type CalendarConnectionRecord, type GoogleCalendarApi } from '../../calendar-connection-ports.js';
import type { InterviewDeps } from '../../interview-ports.js';
import type { RequestContext } from '../feedback/shared.js';
import type { InterviewChange } from './alerts.js';

export type CalendarEventDeps = Pick<InterviewDeps, 'calendarConnections' | 'connectionSecrets' | 'googleCalendarApi' | 'interviewCalendarEvents' | 'interviews' | 'now' | 'onError'>;

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

interface Reached {
  readonly api: GoogleCalendarApi;
  readonly record: CalendarConnectionRecord;
  readonly token: string;
}

/** The person's working Google connection with its token open; null (and the connection broken) when it cannot be. */
async function reach(deps: CalendarEventDeps, api: GoogleCalendarApi, record: CalendarConnectionRecord | null): Promise<Reached | null> {
  if (record === null || record.status !== 'active') return null;
  try {
    return { api, record, token: deps.connectionSecrets.open(record.refreshTokenCiphertext, calendarConnectionSecretContext('google', record.organizationId, record.userId)) };
  } catch {
    await failed(deps, record, 'unreadable_token');
    return null;
  }
}

async function failed(deps: CalendarEventDeps, record: CalendarConnectionRecord, reason: CalendarConnectionError | 'unreadable_token'): Promise<void> {
  deps.onError?.(new InterviewCalendarError(reason));
  if (reason === 'revoked' || reason === 'unreadable_token') {
    await deps.calendarConnections.recordRefresh(record.organizationId, record.userId, 'google', { busy: record.busy, fetchedAt: deps.now(), lastError: 'revoked', status: 'broken' });
  }
}

/** The first member, in the stage's order, whose Google Calendar is connected and working. */
async function ownerOf(deps: CalendarEventDeps, api: GoogleCalendarApi, interview: Interview): Promise<Reached | null> {
  const ids = interview.interviewers.flatMap((person) => (person.kind === 'member' && person.userId ? [person.userId] : []));
  const connections = await deps.calendarConnections.listByUsers(interview.organizationId, ids, 'google');
  const first = ids.map((id) => connections.find((record) => record.userId === id && record.status === 'active')).find((record) => record !== undefined);
  return reach(deps, api, first ?? null);
}

async function create(deps: CalendarEventDeps, owner: Reached, context: RequestContext, interview: Interview): Promise<CalendarEventSync> {
  const start = interview.startsAt!;
  const end = interview.endsAt!;
  const wantsMeet = interview.mode === 'video' && interview.location === null;
  const created = await owner.api.createEvent(owner.token, {
    summary: `${context.job.content.title}: ${context.stage.label} (${context.organization.name})`,
    description: `${context.candidate.firstName} ${context.candidate.lastName}`,
    start,
    end,
    location: interview.location,
    meet: wantsMeet ? { requestId: `interview-${interview.id}` } : null,
  });
  if (!created.ok) {
    await failed(deps, owner.record, created.error);
    return { interview, inCalendarOf: null };
  }
  const now = deps.now();
  await deps.interviewCalendarEvents.save({
    organizationId: interview.organizationId, interviewId: interview.id, userId: owner.record.userId, provider: 'google', externalEventId: created.value.eventId, createdAt: now, updatedAt: now,
  });
  const meetUrl = wantsMeet ? created.value.meetUrl : null;
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
  try {
    const event = await deps.interviewCalendarEvents.find(interview.organizationId, interview.id);
    if (change === 'cancelled') {
      if (event === null) return unchanged;
      await deps.interviewCalendarEvents.remove(interview.organizationId, interview.id);
      const owner = await reach(deps, api, await deps.calendarConnections.find(interview.organizationId, event.userId, 'google'));
      if (owner === null) return unchanged;
      const deleted = await api.deleteEvent(owner.token, event.externalEventId);
      if (!deleted.ok) await failed(deps, owner.record, deleted.error);
      return { interview, inCalendarOf: deleted.ok ? event.userId : null };
    }
    if (!interview.startsAt || !interview.endsAt) return unchanged;
    if (event === null) {
      const owner = await ownerOf(deps, api, interview);
      return owner === null ? unchanged : await create(deps, owner, context, interview);
    }
    const owner = await reach(deps, api, await deps.calendarConnections.find(interview.organizationId, event.userId, 'google'));
    if (owner === null) return unchanged;
    const moved = await api.moveEvent(owner.token, event.externalEventId, { start: interview.startsAt, end: interview.endsAt });
    if (!moved.ok) {
      await failed(deps, owner.record, moved.error);
      return unchanged;
    }
    await deps.interviewCalendarEvents.save({ ...event, updatedAt: deps.now() });
    return { interview, inCalendarOf: event.userId };
  } catch (error) {
    deps.onError?.(error);
    return unchanged;
  }
}
