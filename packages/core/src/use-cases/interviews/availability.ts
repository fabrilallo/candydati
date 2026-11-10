import {
  DAY_MS,
  DEFAULT_WORKING_HOURS,
  freeSlots,
  INTERVIEW_HORIZON_DAYS,
  INTERVIEW_MIN_NOTICE_MINUTES,
  INTERVIEW_STEP_MINUTES,
  type AvailabilityPerson,
  type Interview,
  type InterviewParticipant,
} from '@candydati/domain';
import type { InterviewDeps } from '../../interview-ports.js';
import { refreshCalendars } from '../calendar/refresh.js';
import { zoneOf } from './shared.js';

/** How old a calendar may be when a candidate opens the page; at booking it is always read again. */
export const PAGE_CALENDAR_MAX_AGE_MS = 5 * 60_000;

export interface Availability {
  readonly people: readonly AvailabilityPerson[];
  /** Members without a connected calendar: counted free inside default working hours, and said so to the recruiter. */
  readonly withoutCalendar: readonly string[];
}

type AvailabilityDeps = Pick<InterviewDeps, 'calendarFeeds' | 'calendarReader' | 'calendarSecrets' | 'interviews' | 'config' | 'now'>;

const memberIds = (interviewers: readonly InterviewParticipant[]): readonly string[] =>
  [...new Set(interviewers.flatMap((person) => (person.kind === 'member' && person.userId ? [person.userId] : [])))];

/**
 * Everyone whose time counts: each member with their calendar (or default hours in the platform zone) plus their other
 * booked interviews. With external interviewers only, the platform's default hours stand in, so a candidate still gets
 * times to choose from.
 */
export async function availabilityOf(
  deps: AvailabilityDeps,
  organizationId: string,
  interviewers: readonly InterviewParticipant[],
  options: { readonly maxAgeMs: number; readonly exceptInterviewId?: string },
): Promise<Availability> {
  const ids = memberIds(interviewers);
  const now = deps.now();
  const feeds = await refreshCalendars(deps, organizationId, ids, options.maxAgeMs);
  const booked = await deps.interviews.bookedBusy(organizationId, ids, { from: now, to: new Date(now.getTime() + (INTERVIEW_HORIZON_DAYS + 1) * DAY_MS) }, options.exceptInterviewId);
  const fallback = { timeZone: zoneOf(deps.config), workingHours: DEFAULT_WORKING_HOURS };
  const people = ids.map((userId): AvailabilityPerson => {
    const feed = feeds.find((candidate) => candidate.userId === userId);
    const own = booked.get(userId) ?? [];
    return feed ? { timeZone: feed.timeZone, workingHours: feed.workingHours, busy: [...feed.busy, ...own] } : { ...fallback, busy: own };
  });
  return {
    people: people.length > 0 ? people : [{ ...fallback, busy: [] }],
    withoutCalendar: ids.filter((userId) => !feeds.some((feed) => feed.userId === userId)),
  };
}

/** The free start times for this interview now. */
export function slotsFor(deps: Pick<InterviewDeps, 'now'>, interview: Pick<Interview, 'durationMinutes'>, availability: Availability): readonly Date[] {
  return freeSlots({
    now: deps.now(),
    horizonDays: INTERVIEW_HORIZON_DAYS,
    minNoticeMinutes: INTERVIEW_MIN_NOTICE_MINUTES,
    stepMinutes: INTERVIEW_STEP_MINUTES,
    durationMinutes: interview.durationMinutes,
    people: availability.people,
  });
}
