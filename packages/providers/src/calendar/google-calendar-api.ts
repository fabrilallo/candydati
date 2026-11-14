import type { GoogleCalendarApi, GoogleCallResult, GoogleEventCreated, GoogleEventInput } from '@candydati/core';
import type { BusyInterval, CalendarConnectionError } from '@candydati/domain';
import { z } from 'zod';
import { GOOGLE_TOKEN_URL } from './google-oauth.js';

export const GOOGLE_CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';
const PRIMARY_EVENTS_URL = `${GOOGLE_CALENDAR_API_URL}/calendars/primary/events`;
const TIMEOUT_MS = 8000;
const ANSWER_MAX_CHARS = 256 * 1024;
const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z0-9-]{3,64}$/;

export interface GoogleCalendarApiOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetchImpl?: typeof fetch;
}

const tokenSchema = z.object({ access_token: z.string().min(1).max(4096) });
const tokenErrorSchema = z.object({ error: z.string().max(100) });
const freeBusySchema = z.object({
  calendars: z.object({
    primary: z.object({
      busy: z.array(z.object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) })).max(5000),
      errors: z.array(z.unknown()).optional(),
    }),
  }),
});
const eventSchema = z.object({
  id: z.string().min(1).max(1024),
  hangoutLink: z.string().max(512).optional(),
  conferenceData: z.object({ entryPoints: z.array(z.object({ entryPointType: z.string(), uri: z.string().max(512) })).max(20).optional() }).optional(),
});

type Failure = { readonly ok: false; readonly error: CalendarConnectionError };
const failure = (error: CalendarConnectionError): Failure => ({ ok: false, error });

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

/** One HTTP call; never throws, never follows a redirect, never keeps more than a bounded answer. */
async function send(fetchImpl: typeof fetch, url: string, init: { method: string; body?: string | URLSearchParams; token?: string }): Promise<Answer | Failure> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: init.method,
      ...(init.body !== undefined ? { body: init.body } : {}),
      headers: {
        accept: 'application/json',
        ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
        ...(init.body instanceof URLSearchParams ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return failure('unreachable');
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    return failure('unreachable');
  }
  if (text.length > ANSWER_MAX_CHARS) return failure('refused');
  try {
    return { status: response.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
  } catch {
    return { status: response.status, body: null };
  }
}

const isFailure = (value: Answer | Failure): value is Failure => 'ok' in value;

/** A non-2xx answer of the calendar API: 401 means the grant is gone, anything else a refusal. */
const refusalOf = (status: number): CalendarConnectionError => (status === 401 ? 'revoked' : status >= 500 ? 'unreachable' : 'refused');

const meetOf = (event: z.infer<typeof eventSchema>): string | null => {
  const link = event.hangoutLink ?? event.conferenceData?.entryPoints?.find((point) => point.entryPointType === 'video')?.uri ?? null;
  return link !== null && MEET_URL.test(link) ? link : null;
};

const when = (at: Date) => ({ dateTime: at.toISOString() });

function eventBody(event: GoogleEventInput): string {
  return JSON.stringify({
    summary: event.summary,
    description: event.description,
    start: when(event.start),
    end: when(event.end),
    ...(event.location !== null ? { location: event.location } : {}),
    // Colleagues who can see the calendar see "busy", not the candidate's name.
    visibility: 'private',
    ...(event.meet ? { conferenceData: { createRequest: { requestId: event.meet.requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
  });
}

const eventUrl = (eventId: string) => `${PRIMARY_EVENTS_URL}/${encodeURIComponent(eventId)}`;

async function freeBusy(fetchImpl: typeof fetch, token: string, window: { readonly from: Date; readonly to: Date }): Promise<GoogleCallResult<readonly BusyInterval[]>> {
  const body = JSON.stringify({ timeMin: window.from.toISOString(), timeMax: window.to.toISOString(), items: [{ id: 'primary' }] });
  const answer = await send(fetchImpl, `${GOOGLE_CALENDAR_API_URL}/freeBusy`, { method: 'POST', body, token });
  if (isFailure(answer)) return answer;
  if (answer.status >= 400) return failure(refusalOf(answer.status));
  const parsed = freeBusySchema.safeParse(answer.body);
  if (!parsed.success || (parsed.data.calendars.primary.errors?.length ?? 0) > 0) return failure('refused');
  return { ok: true, value: parsed.data.calendars.primary.busy.map((interval) => ({ start: new Date(interval.start), end: new Date(interval.end) })) };
}

async function insertEvent(fetchImpl: typeof fetch, token: string, event: GoogleEventInput): Promise<GoogleCallResult<GoogleEventCreated>> {
  const answer = await send(fetchImpl, `${PRIMARY_EVENTS_URL}?conferenceDataVersion=1&sendUpdates=none`, { method: 'POST', body: eventBody(event), token });
  if (isFailure(answer)) return answer;
  if (answer.status >= 400) return failure(refusalOf(answer.status));
  const created = eventSchema.safeParse(answer.body);
  if (!created.success) return failure('refused');
  let meetUrl = event.meet ? meetOf(created.data) : null;
  if (event.meet && meetUrl === null) {
    // Google may still be making the Meet: one more read, then the event stands without it.
    const again = await send(fetchImpl, eventUrl(created.data.id), { method: 'GET', token });
    const read = isFailure(again) || again.status >= 400 ? null : eventSchema.safeParse(again.body);
    meetUrl = read?.success ? meetOf(read.data) : null;
  }
  return { ok: true, value: { eventId: created.data.id, meetUrl } };
}

/**
 * The interviewers Google Calendar, plain fetch, no SDK. Every call first trades the refresh token for a short access
 * token (dropped after the call), then reads busy times or writes the interview's event on the primary calendar with
 * `sendUpdates=none`. Every answer is validated with Zod; a failure is a code, never what Google said.
 */
export function createGoogleCalendarApi(options: GoogleCalendarApiOptions): GoogleCalendarApi {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function accessToken(refreshToken: string): Promise<GoogleCallResult<string>> {
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: options.clientId, client_secret: options.clientSecret });
    const answer = await send(fetchImpl, GOOGLE_TOKEN_URL, { method: 'POST', body });
    if (isFailure(answer)) return answer;
    if (answer.status >= 400) {
      const error = tokenErrorSchema.safeParse(answer.body);
      return failure(error.success && error.data.error === 'invalid_grant' ? 'revoked' : refusalOf(answer.status));
    }
    const token = tokenSchema.safeParse(answer.body);
    return token.success ? { ok: true, value: token.data.access_token } : failure('refused');
  }

  async function withToken<T>(refreshToken: string, run: (token: string) => Promise<GoogleCallResult<T>>): Promise<GoogleCallResult<T>> {
    const token = await accessToken(refreshToken);
    return token.ok ? run(token.value) : token;
  }

  return {
    readBusy: (refreshToken, window) => withToken(refreshToken, (token) => freeBusy(fetchImpl, token, window)),

    createEvent: (refreshToken, event) => withToken(refreshToken, (token) => insertEvent(fetchImpl, token, event)),

    moveEvent: (refreshToken, eventId, time) =>
      withToken(refreshToken, async (token): Promise<GoogleCallResult<null>> => {
        const body = JSON.stringify({ start: when(time.start), end: when(time.end) });
        const answer = await send(fetchImpl, `${eventUrl(eventId)}?conferenceDataVersion=1&sendUpdates=none`, { method: 'PATCH', body, token });
        if (isFailure(answer)) return answer;
        return answer.status >= 400 ? failure(refusalOf(answer.status)) : { ok: true, value: null };
      }),

    deleteEvent: (refreshToken, eventId) =>
      withToken(refreshToken, async (token): Promise<GoogleCallResult<null>> => {
        const answer = await send(fetchImpl, `${eventUrl(eventId)}?sendUpdates=none`, { method: 'DELETE', token });
        if (isFailure(answer)) return answer;
        // Already gone (deleted by hand): what was asked.
        if (answer.status === 404 || answer.status === 410) return { ok: true, value: null };
        return answer.status >= 400 ? failure(refusalOf(answer.status)) : { ok: true, value: null };
      }),
  };
}
