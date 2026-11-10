import type { BusyInterval, CalendarFeedError } from '@candydati/domain';
import { createJsonReader, JsonReaderError, type JsonReaderOptions } from '../http/index.js';
import { CalendarParseError, parseBusy, type BusyWindow } from './busy.js';

/**
 * Reads a person's secret iCal address: https on the default port, public addresses only and pinned (no DNS
 * rebinding), at most three re-checked redirects, no credentials sent, a size cap and a timeout. The URL is a secret:
 * it never appears in an error, a log or an event.
 */

export const CALENDAR_FEED_MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

export type CalendarRead = { readonly ok: true; readonly busy: readonly BusyInterval[] } | { readonly ok: false; readonly error: CalendarFeedError };

export interface CalendarFeedReader {
  readBusy(url: string, window: BusyWindow): Promise<CalendarRead>;
}

class TooLarge extends Error {
  constructor() {
    super('calendar: too large');
  }
}

async function collectCapped(source: AsyncIterable<Uint8Array>, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of source) {
    size += chunk.length;
    if (size > maxBytes) throw new TooLarge();
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const errorOf = (error: unknown): CalendarFeedError => {
  if (error instanceof TooLarge) return 'too_large';
  if (error instanceof CalendarParseError) return 'not_calendar';
  if (error instanceof JsonReaderError) {
    if (error.code === 'host_not_allowed' || error.code === 'redirect_refused') return 'not_allowed';
    if (error.code === 'source_invalid_response') return 'not_calendar';
  }
  return 'unreachable';
};

/** `reader` overrides are for tests (loopback server, fake DNS); production uses the defaults. */
export function createCalendarFeedReader(reader: Partial<JsonReaderOptions> = {}): CalendarFeedReader {
  const http = createJsonReader({
    allowedHosts: [],
    downloadTimeoutMs: TIMEOUT_MS,
    maxDownloadBytes: CALENDAR_FEED_MAX_BYTES * 2,
    maxRetries: 1,
    ...reader,
  });
  return {
    async readBusy(url, window) {
      try {
        let text = '';
        await http.downloadPublicFile(url, async (source) => {
          const body = await collectCapped(source, CALENDAR_FEED_MAX_BYTES);
          text = body.toString('utf8');
          return body.length;
        });
        return { ok: true, busy: parseBusy(text, window) };
      } catch (error) {
        return { ok: false, error: errorOf(error) };
      }
    },
  };
}
