import type { CalendarConnectionDeps, CalendarDeps, DrizzleUnitOfWork, FeedbackDeps, GoogleCalendarApi, InterviewDeps, TaskQueue } from '@candydati/core';
import { newConversationToken } from '@candydati/providers';

export interface InterviewInputs {
  readonly uow: DrizzleUnitOfWork;
  /** Stages, interviewers, members, the sender and the hash of secrets: the same as the feedback links. */
  readonly feedbackDeps: FeedbackDeps;
  readonly calendarDeps: CalendarDeps;
  /** The Google refresh tokens are opened with the same box that sealed them. */
  readonly connectionSecrets: CalendarConnectionDeps['connectionSecrets'];
  /** Google Calendar (busy times, the interview's event and Meet); null when the instance has no Google app. */
  readonly googleCalendarApi: GoogleCalendarApi | null;
  /** Queues the invitation's delivery; the worker puts its link in at send time. */
  readonly queue: TaskQueue;
}

/** Interview scheduling on Postgres: the feedback context, the conversation of the application and the calendars. */
export function createInterviewDeps({ uow, feedbackDeps, calendarDeps, connectionSecrets, googleCalendarApi, queue }: InterviewInputs): InterviewDeps {
  const r = uow.repositories;
  return {
    ...feedbackDeps,
    conversations: r.conversations,
    messages: r.messages,
    queue,
    newToken: newConversationToken,
    calendarFeeds: calendarDeps.calendarFeeds,
    calendarReader: calendarDeps.calendarReader,
    calendarSecrets: calendarDeps.calendarSecrets,
    calendarConnections: calendarDeps.calendarConnections,
    connectionSecrets,
    googleCalendarApi,
    interviewCalendarEvents: r.interviewCalendarEvents,
    interviews: r.interviews,
    notifications: r.notifications,
  };
}
