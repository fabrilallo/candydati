import type { Db } from '@candydati/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../config/env.js';
import { EMAIL_SETTINGS_REFRESH_MS, startWorkerEmailRuntime } from './runtime.js';

const BASE = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', BETTER_AUTH_SECRET: 'worker-test-secret-worker-test-secret-1', PLATFORM_URL: 'http://localhost:3000', S3_ENDPOINT: 'http://localhost:9000', S3_BUCKET: 'candydati-test', S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's3-secret-value' };
const brokenDb = (calls: { count: number }) => ({ select: () => { calls.count += 1; throw new Error('db down'); } }) as unknown as Db;

afterEach(() => vi.useRealTimers());

describe('startWorkerEmailRuntime', () => {
  it('uses EMAIL_PROVIDER of the environment without reading the database', async () => {
    const calls = { count: 0 };
    const { runtime, stop } = await startWorkerEmailRuntime(loadEnv({ ...BASE, EMAIL_PROVIDER: 'log' }), brokenDb(calls), () => undefined);
    expect(runtime.snapshot().source).toBe('environment');
    expect(calls.count).toBe(0);
    stop();
  });

  it('reads the saved settings at start and again periodically, staying unconfigured while the database fails', async () => {
    vi.useFakeTimers();
    const calls = { count: 0 };
    const { runtime, stop } = await startWorkerEmailRuntime(loadEnv(BASE), brokenDb(calls), () => undefined);
    expect(runtime.ready()).toBe(false);
    await vi.advanceTimersByTimeAsync(EMAIL_SETTINGS_REFRESH_MS);
    expect(calls.count).toBe(2);
    stop();
  });
});
