import { describe, expect, it } from 'vitest';
import { buildErrorEnvelope, buildErrorEvent, parseDsn, scrubMessage, stackFrames } from './error-report.js';

describe('parseDsn', () => {
  it('reads key, project and origin, with an optional path prefix', () => {
    expect(parseDsn('https://pub@errors.example.org/7')).toEqual({ publicKey: 'pub', projectId: '7', origin: 'https://errors.example.org' });
    expect(parseDsn('https://pub:secret@host.example/sentry/42')).toEqual({ publicKey: 'pub', projectId: '42', origin: 'https://host.example/sentry' });
  });

  it('refuses malformed values', () => {
    for (const bad of ['', 'nope', 'ftp://k@h/1', 'https://host/1', 'https://k@host/', 'https://k@host/a b']) expect(parseDsn(bad)).toBeNull();
  });
});

describe('scrubMessage', () => {
  it('masks emails, long tokens and url queries and caps the length', () => {
    const scrubbed = scrubMessage('failed for ada@example.com at https://x.test/a?token=abc&b=1 key AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
    expect(scrubbed).not.toContain('ada@example.com');
    expect(scrubbed).not.toContain('token=');
    expect(scrubbed).not.toContain('AbCdEf');
    expect(scrubbed).toContain('[email]');
    expect(scrubMessage('word '.repeat(200)).length).toBe(300);
  });
});

describe('stackFrames', () => {
  it('keeps relative paths only, oldest call first', () => {
    const frames = stackFrames(
      ['Error: boom', '    at run (file:///Users/ada/app/apps/api/dist/server.js:10:5)', '    at /app/node_modules/pg/lib/client.js:3:9', '    at node:internal/process:1:1'].join('\n'),
    );
    expect(frames.map((frame) => frame.filename)).toEqual(['node:internal/process', 'node_modules/pg/lib/client.js', 'dist/server.js']);
    expect(JSON.stringify(frames)).not.toContain('/Users/ada');
    expect(frames[2]).toMatchObject({ function: 'run', lineno: 10, colno: 5, in_app: true });
    expect(frames[1]?.in_app).toBe(false);
  });
});

describe('buildErrorEvent', () => {
  const error = Object.assign(new Error('cannot send to ada@example.com'), { requestBody: { email: 'ada@example.com' }, headers: { cookie: 'sid=1' } });

  it('carries the type, the scrubbed message and the tags, and nothing else of the error or the request', () => {
    const event = buildErrorEvent({ error, tags: { service: 'api', request_id: 'abc12345-req', queue: 'email.send' }, environment: 'production', release: '1.2.3' });
    const json = JSON.stringify(event);
    expect(json).not.toContain('ada@example.com');
    expect(json).not.toContain('sid=1');
    expect(Object.keys(event).sort()).toEqual(['environment', 'event_id', 'exception', 'level', 'platform', 'release', 'tags', 'timestamp']);
    expect(event.tags).toEqual({ service: 'api', request_id: 'abc12345-req', queue: 'email.send' });
    expect(event.event_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('uses the injected describer, so database errors keep the safe form', () => {
    const event = buildErrorEvent({ error, describe: () => ({ type: 'DrizzleQueryError', message: 'database error 23505', stack: '' }) });
    expect(JSON.stringify(event)).toContain('database error 23505');
    expect(JSON.stringify(event)).not.toContain('stacktrace');
  });

  it('sanitises tag values and survives non-errors', () => {
    const event = buildErrorEvent({ error: 'a string', tags: { queue: 'bad value\n"x"' } });
    expect(event.tags).toEqual({ queue: 'bad_value__x_' });
    expect(JSON.stringify(event)).toContain('NonError');
  });
});

describe('buildErrorEnvelope', () => {
  it('addresses the collector and writes a three line envelope', () => {
    const dsn = parseDsn('https://pub@errors.example.org/7')!;
    const request = buildErrorEnvelope(dsn, { error: new Error('x'), now: new Date('2026-01-01T00:00:00Z') });
    expect(request.url).toBe('https://errors.example.org/api/7/envelope/');
    expect(request.headers['x-sentry-auth']).toContain('sentry_key=pub');
    const lines = request.body.split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1]!)).toEqual({ type: 'event' });
    expect(JSON.parse(lines[0]!).sent_at).toBe('2026-01-01T00:00:00.000Z');
  });
});
