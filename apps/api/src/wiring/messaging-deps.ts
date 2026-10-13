import { randomUUID } from 'node:crypto';
import {
  createDrizzleApplications,
  createDrizzleCandidates,
  createDrizzleConversations,
  createDrizzleEmailSettings,
  createDrizzleEmailTemplates,
  createDrizzleJobs,
  createDrizzleMessages,
  createDrizzleOrganizationDirectory,
  createDrizzleResponsePromises,
  createDrizzleUserDirectory,
  type AuditLogRepository,
  type EmailIdentity,
  type EmailSender,
  type InboundDeps,
  type MessagingDeps,
  type ReceiptDeps,
  type TaskQueue,
} from '@tt/core';
import type { Db } from '@tt/db';
import type { Env } from '../config/env.js';
import { newConversationToken, toMessagingConfig } from '@tt/providers';

export interface MessagingWiring {
  readonly messagingDeps: MessagingDeps;
  readonly inboundDeps: InboundDeps;
  readonly receipts: ReceiptDeps;
}

export interface MessagingInputs {
  readonly env: Env;
  readonly db: Db;
  readonly auditLog: AuditLogRepository;
  readonly queue: TaskQueue;
  readonly sender: EmailSender;
  readonly identity: EmailIdentity;
  readonly onReceiptError: (error: unknown) => void;
}

/** Templates, settings, conversations and messages on Postgres; sender and identity are injected. */
export function createMessagingDeps({ env, db, auditLog, queue, sender, identity, onReceiptError }: MessagingInputs): MessagingWiring {
  const messages = createDrizzleMessages(db);
  const conversations = createDrizzleConversations(db);
  const templates = createDrizzleEmailTemplates(db);
  const candidates = createDrizzleCandidates(db);
  const applications = createDrizzleApplications(db);
  const config = toMessagingConfig(env.platform, env.email);
  const clock = { newId: randomUUID, now: () => new Date() };
  return {
    messagingDeps: {
      auditLog,
      jobs: createDrizzleJobs(db),
      organizations: createDrizzleOrganizationDirectory(db),
      candidates,
      applications,
      users: createDrizzleUserDirectory(db),
      templates,
      settings: createDrizzleEmailSettings(db),
      conversations,
      messages,
      promises: createDrizzleResponsePromises(db),
      queue,
      identity,
      sender,
      config,
      newToken: newConversationToken,
      ...clock,
    },
    inboundDeps: { auditLog, candidates, applications, conversations, messages, ...clock },
    receipts: { templates, conversations, messages, config, newToken: newConversationToken, onError: onReceiptError },
  };
}
