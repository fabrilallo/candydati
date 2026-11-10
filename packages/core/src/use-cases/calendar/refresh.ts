import { calendarSecretContext, type CalendarDeps, type CalendarFeedRecord } from '../../calendar-ports.js';
import { busyWindowOf } from './feed.js';

type RefreshDeps = Pick<CalendarDeps, 'calendarFeeds' | 'calendarReader' | 'calendarSecrets' | 'now'>;

/**
 * Reads again the calendars older than `maxAgeMs` (0: always), for the people given, and returns every connected one.
 * A failed read keeps the last busy times and records why: a calendar that cannot be read now never frees a slot it
 * held before. People without a calendar are simply absent from the result.
 */
export async function refreshCalendars(
  deps: RefreshDeps,
  organizationId: string,
  userIds: readonly string[],
  maxAgeMs: number,
): Promise<readonly CalendarFeedRecord[]> {
  const feeds = await deps.calendarFeeds.listByUsers(organizationId, userIds);
  const now = deps.now();
  const fresh = (feed: CalendarFeedRecord) => feed.fetchedAt !== null && now.getTime() - feed.fetchedAt.getTime() < maxAgeMs;
  return Promise.all(
    feeds.map(async (feed) => {
      if (fresh(feed)) return feed;
      let url: string;
      try {
        url = deps.calendarSecrets.open(feed.urlCiphertext, calendarSecretContext(organizationId, feed.userId));
      } catch {
        // A seal that no longer opens (the instance secret changed): the person must paste the address again.
        const broken = { busy: feed.busy, fetchedAt: now, lastError: 'unreachable' as const };
        await deps.calendarFeeds.recordRefresh(organizationId, feed.userId, broken);
        return { ...feed, ...broken };
      }
      const read = await deps.calendarReader.readBusy(url, busyWindowOf(now, feed.timeZone));
      const refresh = read.ok ? { busy: read.busy, fetchedAt: now, lastError: null } : { busy: feed.busy, fetchedAt: now, lastError: read.error };
      await deps.calendarFeeds.recordRefresh(organizationId, feed.userId, refresh);
      return { ...feed, ...refresh };
    }),
  );
}
