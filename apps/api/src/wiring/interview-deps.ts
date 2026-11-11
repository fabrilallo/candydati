import type { CalendarDeps, DrizzleUnitOfWork, FeedbackDeps, InterviewDeps, TaskQueue } from '@candydati/core';
import { newConversationToken } from '@candydati/providers';

export interface InterviewInputs {
  readonly uow: DrizzleUnitOfWork;
  /** Stages, interviewers, members, the sender and the hash of secrets: the same as the feedback links. */
  readonly feedbackDeps: FeedbackDeps;
  readonly calendarDeps: CalendarDeps;
  /** Queues the invitation's delivery; the worker puts its link in at send time. */
  readonly queue: TaskQueue;
}

/** Interview scheduling on Postgres: the feedback context, the conversation of the application and the calendars. */
export function createInterviewDeps({ uow, feedbackDeps, calendarDeps, queue }: InterviewInputs): InterviewDeps {
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
    videoRooms: calendarDeps.videoRooms,
    interviews: r.interviews,
    notifications: r.notifications,
  };
}
