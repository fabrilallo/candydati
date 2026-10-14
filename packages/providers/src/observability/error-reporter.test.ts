import { describe, expect, it, vi } from 'vitest';
import { createErrorReporter } from './error-reporter.js';

const DSN = 'https://pub@errors.example.org/7';
const ok = () => Promise.resolve(new Response('{}', { status: 200 }));

describe('error reporter', () => {
  it('sends nothing, anywhere, without a DSN', () => {
    const fetchSpy = vi.fn(ok);
    const reporter = createErrorReporter({ dsn: null, service: 'api', fetch: fetchSpy });
    reporter.capture(new Error('x'));
    expect(reporter.enabled).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is off and says so when the DSN is malformed', () => {
    const onProblem = vi.fn();
    expect(createErrorReporter({ dsn: 'nope', service: 'api', onProblem }).enabled).toBe(false);
    expect(onProblem).toHaveBeenCalledWith(expect.stringContaining('not a valid DSN'));
  });

  it('posts a scrubbed envelope: no body, header, email or candidate field leaves the process', async () => {
    const fetchSpy = vi.fn(ok);
    const reporter = createErrorReporter({ dsn: DSN, service: 'worker', environment: 'production', fetch: fetchSpy });
    const error = Object.assign(new Error('cannot mail ada.lovelace@example.com'), {
      body: { fullName: 'Ada Lovelace', cv: 'secret cv text' },
      headers: { authorization: 'Bearer abcdefghijklmnopqrstuvwxyz0123' },
      params: ['ada.lovelace@example.com'],
    });
    reporter.capture(error, { queue: 'email.send', request_id: 'req-12345678' });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://errors.example.org/api/7/envelope/');
    const body = String(init.body);
    for (const leak of ['ada.lovelace', 'Ada Lovelace', 'secret cv', 'abcdefghijklmnop', 'authorization']) expect(body).not.toContain(leak);
    expect(body).toContain('"queue":"email.send"');
    expect(body).toContain('"service":"worker"');
  });

  it('uses the injected describer for database errors', () => {
    const fetchSpy = vi.fn(ok);
    createErrorReporter({ dsn: DSN, service: 'api', fetch: fetchSpy, describe: () => ({ type: 'Db', message: 'database error 23505', stack: '' }) }).capture(new Error('Failed query: insert ... params: ada@example.com'));
    const body = String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).toContain('database error 23505');
    expect(body).not.toContain('ada@example.com');
  });

  it('caps the reports per minute and reports delivery problems without content', async () => {
    let clock = 0;
    const onProblem = vi.fn();
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('no', { status: 500 })));
    const reporter = createErrorReporter({ dsn: DSN, service: 'api', maxPerMinute: 2, fetch: fetchSpy, now: () => clock, onProblem });
    for (let i = 0; i < 5; i += 1) reporter.capture(new Error('x'));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(onProblem).toHaveBeenCalledWith('error collector answered 500');
    clock = 61_000;
    reporter.capture(new Error('x'));
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(onProblem).toHaveBeenCalledWith('3 error report(s) dropped by the rate limit');
  });

  it('never throws, even when the collector is down', async () => {
    const onProblem = vi.fn();
    const reporter = createErrorReporter({ dsn: DSN, service: 'web', fetch: () => Promise.reject(new TypeError('fetch failed')), onProblem });
    expect(() => reporter.capture(new Error('x'))).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onProblem).toHaveBeenCalledWith('error collector unreachable (TypeError)');
  });
});
