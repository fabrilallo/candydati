import { randomUUID } from 'node:crypto';
import type { AdQualityAnalyzer } from '@tt/domain';
import { createDb, type DbHandle } from '@tt/db';
import type { FastifyInstance } from 'fastify';
import type { InvitationEmail, EmailSender } from '../auth/email-sender.js';
import type { RateLimitSettings } from '../app-context.js';
import { parseEnv, type Env } from '../config/env.js';
import { createInMemoryFileStorage, createInMemoryTaskQueue, fakeAdQualityAnalyzer, type InMemoryFileStorage, type InMemoryTaskQueue } from '@tt/core/testing';
import { buildServer } from '../server.js';
import { apiTestDatabaseUrl } from './test-database.js';

export const WEB_ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'correct-horse-battery';

export const testEnv = (overrides: Record<string, string> = {}): Env =>
  parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: apiTestDatabaseUrl(),
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    BETTER_AUTH_URL: WEB_ORIGIN,
    WEB_ORIGIN,
    TRUSTED_ORIGINS: 'http://localhost:3100',
    PLATFORM_URL: WEB_ORIGIN,
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'team-tracker-test',
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test-secret',
    ...overrides,
  });

export interface TestApp {
  readonly app: FastifyInstance;
  readonly handle: DbHandle;
  readonly sentInvitations: readonly InvitationEmail[];
  readonly files: InMemoryFileStorage;
  readonly queue: InMemoryTaskQueue;
  close(): Promise<void>;
}

const HIGH_LIMITS: RateLimitSettings = { max: 100_000, authMax: 100_000, publicMax: 100_000, qualityMax: 100_000, applyMax: 100_000 };

export async function createTestApp(options: { rateLimit?: RateLimitSettings; emailSender?: EmailSender; adQuality?: AdQualityAnalyzer } = {}): Promise<TestApp> {
  const handle = createDb(apiTestDatabaseUrl(), 4);
  const sent: InvitationEmail[] = [];
  const files = createInMemoryFileStorage();
  const queue = createInMemoryTaskQueue();
  const emailSender: EmailSender = options.emailSender ?? { sendInvitation: async (email) => void sent.push(email) };
  const app = await buildServer({ env: testEnv(), db: handle.db, emailSender, rateLimit: options.rateLimit ?? HIGH_LIMITS, adQuality: options.adQuality ?? fakeAdQualityAnalyzer(), files, queue });
  await app.ready();
  return {
    app,
    handle,
    sentInvitations: sent,
    files,
    queue,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

export const uniqueEmail = (label: string): string => `${label}-${randomUUID().slice(0, 8)}@example.com`;
