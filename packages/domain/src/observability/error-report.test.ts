import { describe, expect, it } from 'vitest';
import { buildErrorEnvelope, buildErrorEvent, parseDsn, readFrameLine, scrubMessage, stackFrames } from './error-report.js';

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

  it('keeps the masking of the regex version word by word', () => {
    expect(scrubMessage('  to (ada@example.com),\tcc <bob.b@mail.example.it>  ')).toBe('to ([email]), cc <[email]>');
    expect(scrubMessage('see https://x.test/a/b#frag?x=1 and http://y.test?q')).toBe('see https://x.test/a/b and http://y.test');
    expect(scrubMessage('pkg@1.2.3 failed')).toBe('pkg@1.2.3 failed');
  });

  it('masks a word too long to be prose and never leaks half an email cut at the input limit', () => {
    expect(scrubMessage(`a ${'x!'.repeat(400)} b`)).toBe('a [redacted] b');
    const message = `${'word '.repeat(819)}abc ada.lovelace@example.com`;
    expect(scrubMessage(message)).not.toContain('ada.lovelace');
  });

  it('finishes fast on hostile input (CodeQL js/polynomial-redos)', () => {
    const started = performance.now();
    scrubMessage('!'.repeat(50_000));
    scrubMessage('! '.repeat(25_000));
    scrubMessage(`${'a'.repeat(500)}@${'b'.repeat(11)} `.repeat(100));
    expect(performance.now() - started).toBeLessThan(200);
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

  /** The regex the parser replaced: the parser must read every line the same way. */
  const LEGACY_FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
  it.each([
    '    at run (/app/src/a.ts:10:5)',
    '    at /app/node_modules/pg/lib/client.js:3:9',
    '    at async Promise.all (index 0)',
    '    at Object.<anonymous> (C:\\app\\src\\a.js:1:2)',
    '    at new Foo (bar (baz):1:2)',
    '    at fn (file:3:4',
    '    at  (x:1:2)',
    '    at a (:1:2)',
    'at x:1:2:3',
    'at x:1:2))',
    'at x:1:a',
    'at :1:2',
    'at x:1:2\r',
    'at a\rb (x:1:2)',
    '    at f (x:1:2) extra',
    'Error: boom',
    '',
  ])('reads %j like the legacy regex', (line) => {
    const legacy = LEGACY_FRAME.exec(line);
    expect(readFrameLine(line)).toEqual(legacy ? { function: legacy[1], file: legacy[2], lineno: Number(legacy[3]), colno: Number(legacy[4]) } : null);
  });

  it('reads at most 50 frames', () => {
    expect(stackFrames('    at f (/app/src/a.ts:1:1)\n'.repeat(80))).toHaveLength(50);
  });

  it('finishes fast on hostile input (CodeQL js/polynomial-redos)', () => {
    const started = performance.now();
    expect(stackFrames(`at ${'a (a'.repeat(12_500)}`)).toEqual([]);
    stackFrames(`  at ${'a (a:1'.repeat(10_000)}`);
    stackFrames(`at ${'a (a'.repeat(12_500)}\n`.repeat(4));
    expect(performance.now() - started).toBeLessThan(200);
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
