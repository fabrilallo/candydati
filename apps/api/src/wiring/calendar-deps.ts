import type { CalendarDeps, DrizzleUnitOfWork } from '@candydati/core';
import { createCalendarFeedReader, createSecretBox } from '@candydati/providers';
import type { Env } from '../config/env.js';

/** One key per purpose, derived from the instance secret: a calendar address never opens with another key. */
export const CALENDAR_SECRET_INFO = 'candydati:calendar-feed';

export interface CalendarInputs {
  readonly env: Pick<Env, 'BETTER_AUTH_SECRET'>;
  readonly uow: DrizzleUnitOfWork;
  /** The SSRF-safe reader by default; a fake in tests. */
  readonly reader?: CalendarDeps['calendarReader'] | undefined;
}

export function createCalendarDeps({ env, uow, reader }: CalendarInputs): CalendarDeps {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobTeams: r.jobTeams,
    calendarFeeds: r.calendarFeeds,
    calendarReader: reader ?? createCalendarFeedReader(),
    calendarSecrets: createSecretBox(env.BETTER_AUTH_SECRET, { info: CALENDAR_SECRET_INFO }),
    now: () => new Date(),
  };
}
