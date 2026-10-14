import { randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type EmailIdentity,
  type EmailSender,
  type InboundDeps,
  type MessagingDeps,
  type ReceiptDeps,
  type TaskQueue,
} from '@tt/core';
import type { Env } from '../config/env.js';
import { newConversationToken, toMessagingConfig } from '@tt/providers';

export interface MessagingWiring {
  readonly messagingDeps: MessagingDeps;
  readonly inboundDeps: InboundDeps;
  readonly receipts: ReceiptDeps;
}

export interface MessagingInputs {
  readonly env: Env;
  readonly uow: DrizzleUnitOfWork;
  readonly queue: TaskQueue;
  readonly sender: EmailSender;
  readonly identity: EmailIdentity;
  readonly onReceiptError: (error: unknown) => void;
}

/** Templates, settings, conversations and messages on Postgres; sender and identity are injected. */
export function createMessagingDeps({ env, uow, queue, sender, identity, onReceiptError }: MessagingInputs): MessagingWiring {
  const r = uow.repositories;
  const core = { auditLog: r.auditLog, transaction: uow.transaction, jobTeams: r.jobTeams };
  const config = toMessagingConfig(env.platform, env.email);
  const clock = { newId: randomUUID, now: () => new Date() };
  const { candidates, applications, conversations, messages, templates } = r;
  return {
    messagingDeps: {
      ...core,
      jobs: r.jobs,
      organizations: r.organizations,
      candidates,
      applications,
      users: r.users,
      templates,
      settings: r.settings,
      conversations,
      messages,
      promises: r.promises,
      queue,
      identity,
      sender,
      config,
      newToken: newConversationToken,
      ...clock,
    },
    inboundDeps: { ...core, candidates, applications, conversations, messages, ...clock },
    receipts: { templates, conversations, messages, config, newToken: newConversationToken, dailyMaxPerOrganization: env.RECEIPTS_DAILY_MAX_PER_ORGANIZATION, onError: onReceiptError },
  };
}
