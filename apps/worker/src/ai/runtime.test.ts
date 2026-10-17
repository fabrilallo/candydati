import type { Db } from '@candydati/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../config/env.js';
import { EMAIL_SETTINGS_REFRESH_MS } from '../email/runtime.js';
import { startWorkerAiRuntime } from './runtime.js';

const BASE = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', BETTER_AUTH_SECRET: 'worker-test-secret-worker-test-secret-1', PLATFORM_URL: 'http://localhost:3000', S3_ENDPOINT: 'http://localhost:9000', S3_BUCKET: 'candydati-test', S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's3-secret-value' };
/** A database whose every query fails: the runtime must keep working (no model) and say so in the log. */
const brokenDb = (calls: { count: number }) => ({ select: () => { calls.count += 1; throw new Error('db down'); } }) as unknown as Db;

afterEach(() => vi.useRealTimers());

describe('startWorkerAiRuntime', () => {
  it('starts with the fast model of the environment, without reading the database', async () => {
    const calls = { count: 0 };
    const { runtime, stop } = await startWorkerAiRuntime(loadEnv({ ...BASE, FAST_MODEL: 'test/fast' }), brokenDb(calls), () => undefined);
    expect(runtime.snapshot()).toMatchObject({ source: 'environment', fast: { id: 'test/fast' } });
    expect(calls.count).toBe(0);
    stop();
  });

  it('reads the saved settings at start and again periodically, keeping no model while the database fails', async () => {
    vi.useFakeTimers();
    const calls = { count: 0 };
    const lines: string[] = [];
    const { runtime, stop } = await startWorkerAiRuntime(loadEnv(BASE), brokenDb(calls), (line) => lines.push(line));
    expect(runtime.snapshot()).toMatchObject({ source: 'none', fast: null });
    expect(calls.count).toBe(1);
    await vi.advanceTimersByTimeAsync(EMAIL_SETTINGS_REFRESH_MS);
    expect(calls.count).toBe(2);
    expect(lines.join('\n')).toMatch(/AI settings/);
    stop();
    await vi.advanceTimersByTimeAsync(EMAIL_SETTINGS_REFRESH_MS);
    expect(calls.count).toBe(2);
  });
});
