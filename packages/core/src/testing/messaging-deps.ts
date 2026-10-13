import type { MessagingDeps } from '../messaging-ports.js';
import type { TestCandidateDeps } from './candidate-deps.js';
import { seedCandidateWorld, type SeedOptions } from './candidate-seed.js';
import {
  createFakeEmailIdentity,
  createFakeEmailSender,
  createInMemoryConversationRepository,
  createInMemoryEmailSettingsRepository,
  createInMemoryEmailTemplateRepository,
  createTokenGenerator,
  testMessagingConfig,
  type FakeEmailIdentity,
  type FakeEmailSender,
  type MessagingStoreState,
} from './in-memory-messaging.js';

export type TestMessagingDeps = MessagingDeps &
  TestCandidateDeps & {
    readonly identity: FakeEmailIdentity;
    readonly sender: FakeEmailSender;
  };

export interface MessagingSeedOptions extends SeedOptions {
  readonly messaging?: Partial<MessagingStoreState>;
  readonly messagingOverrides?: Partial<TestMessagingDeps>;
}

/** The Phase 2 world (`org_a` with job `job_1`, one candidate and application) plus the messaging ports, in memory. */
export function seedMessagingWorld(options: MessagingSeedOptions = {}): TestMessagingDeps {
  const world: TestCandidateDeps = seedCandidateWorld(options);
  const { messagingStore } = world;
  messagingStore.write(options.messaging ?? {});
  return {
    ...world,
    templates: createInMemoryEmailTemplateRepository(messagingStore),
    settings: createInMemoryEmailSettingsRepository(messagingStore),
    conversations: createInMemoryConversationRepository(messagingStore),
    identity: createFakeEmailIdentity(),
    sender: createFakeEmailSender(),
    config: testMessagingConfig,
    newToken: createTokenGenerator(),
    ...options.messagingOverrides,
  };
}
