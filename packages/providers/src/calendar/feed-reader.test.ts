import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CALENDAR_FEED_MAX_BYTES, createCalendarFeedReader } from './feed-reader.js';
import type { BusyWindow } from './busy.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let server: Server;
let port = 0;
let handler: Handler = (_req, res) => res.writeHead(500).end();
let seen: IncomingMessage[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push(req);
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(() => {
  seen = [];
});

const window: BusyWindow = { from: new Date('2026-11-16T00:00:00Z'), to: new Date('2026-11-30T00:00:00Z'), timeZone: 'Europe/Rome' };
const ICS = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//T//EN', 'BEGIN:VEVENT', 'UID:a', 'DTSTART:20261116T090000Z', 'DTEND:20261116T100000Z', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
const local = () => createCalendarFeedReader({ unsafeAllowLoopbackForTests: true, resolve: async () => ['127.0.0.1'], sleep: async () => undefined, backoff: { baseMs: 1, maxMs: 2 } });
const url = (path = '/private-secret/basic.ics') => `http://calendar.example.com:${port}${path}`;

describe('reading a secret calendar address', () => {
  it('returns the busy times and sends no credentials', async () => {
    handler = (_req, res) => res.writeHead(200, { 'content-type': 'text/calendar' }).end(ICS);
    const read = await local().readBusy(url(), window);
    expect(read).toEqual({ ok: true, busy: [{ start: new Date('2026-11-16T09:00:00Z'), end: new Date('2026-11-16T10:00:00Z') }] });
    expect(seen[0]?.headers.authorization).toBeUndefined();
    expect(seen[0]?.headers.cookie).toBeUndefined();
  });

  it('says why it could not read, never with the address', async () => {
    handler = (_req, res) => res.writeHead(404).end();
    expect(await local().readBusy(url(), window)).toEqual({ ok: false, error: 'unreachable' });
    handler = (_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<html>Sign in</html>');
    expect(await local().readBusy(url(), window)).toEqual({ ok: false, error: 'not_calendar' });
    handler = (_req, res) => res.writeHead(200, { 'content-type': 'text/calendar' }).end('x'.repeat(CALENDAR_FEED_MAX_BYTES + 1));
    expect(await local().readBusy(url(), window)).toEqual({ ok: false, error: 'too_large' });
  });

  it('refuses private addresses, plain http and credentials in the URL in production settings', async () => {
    const production = createCalendarFeedReader({ resolve: async () => ['10.0.0.5'] });
    expect(await production.readBusy('https://calendar.example.com/a.ics', window)).toEqual({ ok: false, error: 'not_allowed' });
    expect(await production.readBusy('http://calendar.example.com/a.ics', window)).toEqual({ ok: false, error: 'not_allowed' });
    expect(await production.readBusy('https://user:pass@calendar.example.com/a.ics', window)).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('follows a redirect only to a URL that passes the same checks', async () => {
    let first = true;
    handler = (_req, res) => {
      if (first) {
        first = false;
        res.writeHead(302, { location: url('/moved.ics') }).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/calendar' }).end(ICS);
    };
    expect((await local().readBusy(url(), window)).ok).toBe(true);
    expect(seen.map((req) => req.url)).toEqual(['/private-secret/basic.ics', '/moved.ics']);
  });
});
