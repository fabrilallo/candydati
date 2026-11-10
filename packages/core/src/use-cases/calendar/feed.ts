import {
  CALENDAR_BUSY_HORIZON_DAYS,
  calendarFeedInputSchema,
  calendarPreferencesInputSchema,
  DAY_MS,
  DEFAULT_WORKING_HOURS,
  type CalendarFeedError,
  type WorkingHours,
} from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { calendarSecretContext, type CalendarDeps, type CalendarFeedRecord } from '../../calendar-ports.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { defineUseCase } from '../../use-case.js';

/** What a person sees of their own calendar link: never the address. */
export interface CalendarFeedView {
  readonly connected: boolean;
  readonly host: string | null;
  readonly timeZone: string | null;
  readonly workingHours: WorkingHours;
  readonly fetchedAt: Date | null;
  readonly lastError: CalendarFeedError | null;
}

const NOT_CONNECTED: CalendarFeedView = { connected: false, host: null, timeZone: null, workingHours: DEFAULT_WORKING_HOURS, fetchedAt: null, lastError: null };

const toView = (record: CalendarFeedRecord | null): CalendarFeedView =>
  record === null
    ? NOT_CONNECTED
    : { connected: true, host: record.host, timeZone: record.timeZone, workingHours: record.workingHours, fetchedAt: record.fetchedAt, lastError: record.lastError };

/** A calendar is personal: only the person, in a session, connects or reads theirs; never an API key or the assistant. */
function personOf(actor: Actor): string {
  if (actor.type !== 'user') throw new ForbiddenError('Only a person connects their own calendar.');
  return actor.id;
}

export const busyWindowOf = (now: Date, timeZone: string) => ({ from: now, to: new Date(now.getTime() + CALENDAR_BUSY_HORIZON_DAYS * DAY_MS), timeZone });

export const getMyCalendarFeed = defineUseCase<CalendarDeps, z.ZodObject<Record<string, never>>, CalendarFeedView>({
  name: 'getMyCalendarFeed',
  input: z.object({}),
  permission: { skip: 'a person reads only their own calendar link, checked in the handler' },
  audit: { skip: 'read of the person’s own setting, without the address' },
  handler: async ({ deps, actor }) => toView(await deps.calendarFeeds.find(actor.organizationId, personOf(actor))),
});

/**
 * Connects a secret iCal address: it is read once first, and refused when it cannot be read (the person learns why at
 * once, not when a candidate finds no times). The address is sealed; only busy times inside the horizon are kept.
 */
export const saveCalendarFeed = defineUseCase<CalendarDeps, typeof calendarFeedInputSchema, CalendarFeedView>({
  name: 'saveCalendarFeed',
  input: calendarFeedInputSchema,
  permission: { skip: 'a person connects only their own calendar, checked in the handler' },
  transaction: { skip: 'the address is read over the network before anything is written; the save is one statement' },
  audit: {
    action: 'calendar_feed.saved',
    target: (_input, _result, actor) => ({ type: 'calendar_feed', id: actor.id ?? 'unknown' }),
    metadata: (_input, result) => ({ host: result.host, timeZone: result.timeZone }),
  },
  handler: async ({ deps, actor, input }) => {
    const userId = personOf(actor);
    const now = deps.now();
    const read = await deps.calendarReader.readBusy(input.url, busyWindowOf(now, input.timeZone));
    if (!read.ok) throw new ValidationError([{ path: 'url', message: `calendar_${read.error}` }]);
    const existing = await deps.calendarFeeds.find(actor.organizationId, userId);
    const record: CalendarFeedRecord = {
      organizationId: actor.organizationId,
      userId,
      urlCiphertext: deps.calendarSecrets.seal(input.url, calendarSecretContext(actor.organizationId, userId)),
      host: new URL(input.url).hostname,
      timeZone: input.timeZone,
      workingHours: input.workingHours,
      busy: read.busy,
      fetchedAt: now,
      lastError: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await deps.calendarFeeds.save(record);
    return toView(record);
  },
});

/** Working hours and time zone, without pasting the address again. */
export const updateCalendarPreferences = defineUseCase<CalendarDeps, typeof calendarPreferencesInputSchema, CalendarFeedView>({
  name: 'updateCalendarPreferences',
  input: calendarPreferencesInputSchema,
  permission: { skip: 'a person changes only their own calendar, checked in the handler' },
  audit: {
    action: 'calendar_feed.saved',
    target: (_input, _result, actor) => ({ type: 'calendar_feed', id: actor.id ?? 'unknown' }),
    metadata: (input) => ({ timeZone: input.timeZone, preferencesOnly: true }),
  },
  handler: async ({ deps, actor, input }) => {
    const userId = personOf(actor);
    const updated = await deps.calendarFeeds.updatePreferences(actor.organizationId, userId, { ...input, updatedAt: deps.now() });
    if (!updated) throw new NotFoundError('No calendar is connected.');
    return toView(await deps.calendarFeeds.find(actor.organizationId, userId));
  },
});

/** Disconnects: the sealed address and the busy times go. */
export const removeCalendarFeed = defineUseCase<CalendarDeps, z.ZodObject<Record<string, never>>, { readonly removed: boolean }>({
  name: 'removeCalendarFeed',
  input: z.object({}),
  permission: { skip: 'a person disconnects only their own calendar, checked in the handler' },
  audit: {
    action: (_input, result) => (result.removed ? 'calendar_feed.removed' : null),
    target: (_input, _result, actor) => ({ type: 'calendar_feed', id: actor.id ?? 'unknown' }),
  },
  handler: async ({ deps, actor }) => ({ removed: await deps.calendarFeeds.remove(actor.organizationId, personOf(actor)) }),
});
