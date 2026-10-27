import { randomUUID } from 'node:crypto';
import type { AiModelCheck, DistributionChannel, InstanceEmailTester, ResponsibilitySuggester } from '@candydati/core';
import type { AdQualityAnalyzer } from '@candydati/domain';
import { createDb, type DbHandle } from '@candydati/db';
import type { FastifyInstance } from 'fastify';
import type { MigrationConnectorRegistry } from '@candydati/providers';
import type { AccountMailer } from '../auth/account-mailer.js';
import { createRecordingMailer, registerMailbox, type RecordingMailer } from './mailbox.js';
import type { RateLimitSettings } from '../app-context.js';
import { parseEnv, type Env } from '../config/env.js';
import { createFakeEmailIdentity, createFakeEmailSender, createInMemoryFileStorage, createInMemoryTaskQueue, fakeAdQualityAnalyzer, type FakeEmailSender, type InMemoryFileStorage, type InMemoryTaskQueue } from '@candydati/core/testing';
import { createInMemoryThrottleStore, type ThrottleStore } from '../auth/sign-in-throttle.js';
import { buildServer } from '../server.js';
import { apiTestDatabaseUrl } from './test-database.js';

export const WEB_ORIGIN = 'http://localhost:3000';
export const WEBHOOK_SECRET = 'test-webhook-secret-test-webhook-secret';
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
    S3_BUCKET: 'candydati-test',
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test-secret',
    // Set: the environment decides how the tests send email (ready). Tests about email from the app pass EMAIL_PROVIDER: ''.
    EMAIL_PROVIDER: 'log',
    EMAIL_DOMAIN: 'mail.test.example',
    EMAIL_FROM_LOCAL: 'jobs',
    EMAIL_INBOUND_DOMAIN: 'in.test.example',
    INBOUND_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...overrides,
  });

export interface TestApp {
  readonly app: FastifyInstance;
  readonly handle: DbHandle;
  /** Account emails (verification, reset, invitations) the app sent, newest last. */
  readonly mailbox: RecordingMailer;
  readonly files: InMemoryFileStorage;
  readonly queue: InMemoryTaskQueue;
  readonly emailSender: FakeEmailSender;
  close(): Promise<void>;
}

const HIGH_LIMITS: RateLimitSettings = { max: 100_000, authMax: 100_000, authEmailMax: 100_000, publicMax: 100_000, qualityMax: 100_000, applyMax: 100_000, importMax: 100_000, consentMax: 100_000 };

export interface TestAppOptions {
  readonly rateLimit?: RateLimitSettings;
  readonly accountMailer?: AccountMailer;
  readonly adQuality?: AdQualityAnalyzer;
  readonly responsibilitySuggester?: ResponsibilitySuggester;
  readonly distributionChannels?: readonly DistributionChannel[];
  readonly reportClock?: () => Date;
  readonly env?: Record<string, string>;
  readonly throttleStore?: ThrottleStore;
  readonly migrationConnectors?: MigrationConnectorRegistry;
  readonly instanceEmailTester?: InstanceEmailTester;
  readonly aiCheck?: AiModelCheck;
  /** A database of its own (prepared by the caller), for tests about an instance with no account at all. */
  readonly databaseUrl?: string;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const databaseUrl = options.databaseUrl ?? apiTestDatabaseUrl();
  const handle = createDb(databaseUrl, 4);
  const mailbox = createRecordingMailer();
  const files = createInMemoryFileStorage();
  const queue = createInMemoryTaskQueue();
  const fakeSender = createFakeEmailSender();
  const app = await buildServer({ env: testEnv({ DATABASE_URL: databaseUrl, ...options.env }), throttleStore: options.throttleStore ?? createInMemoryThrottleStore(), db: handle.db, accountMailer: options.accountMailer ?? mailbox, rateLimit: options.rateLimit ?? HIGH_LIMITS, adQuality: options.adQuality ?? fakeAdQualityAnalyzer(), responsibilitySuggester: options.responsibilitySuggester, files, queue, messaging: { sender: fakeSender, identity: createFakeEmailIdentity() }, distributionChannels: options.distributionChannels, migrationConnectors: options.migrationConnectors, reportClock: options.reportClock, instanceEmailTester: options.instanceEmailTester, aiCheck: options.aiCheck });
  await app.ready();
  registerMailbox(app, mailbox);
  return {
    app,
    handle,
    mailbox,
    files,
    queue,
    emailSender: fakeSender,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

export const uniqueEmail = (label: string): string => `${label}-${randomUUID().slice(0, 8)}@example.com`;
