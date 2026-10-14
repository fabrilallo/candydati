import {
  type DrizzleUnitOfWork,
  type DeliverDeps,
  type EmailSender,
} from '@tt/core';
import type { PlatformConfig } from '@tt/domain';
import type { EmailConfig } from '@tt/providers';
import { newConversationToken, toMessagingConfig } from '@tt/providers';
import { hashConsentSecret, newConsentSecret } from '../import/deps.js';

export interface EmailDeliveryWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly sender: EmailSender;
  readonly platform: PlatformConfig;
  readonly email: EmailConfig;
}

/**
 * Drizzle repositories and the injected sender: what `deliverMessage` needs. With the consent tokens: an import
 * reconfirmation request gets its link (a fresh single-use secret) only here, at send time.
 */
export function createDeliverDeps({ uow, sender, platform, email }: EmailDeliveryWiring): DeliverDeps {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    organizations: r.organizations,
    candidates: r.candidates,
    applications: r.applications,
    settings: r.settings,
    conversations: r.conversations,
    messages: r.messages,
    promises: r.promises,
    sender,
    config: toMessagingConfig(platform, email),
    newToken: newConversationToken,
    now: () => new Date(),
    reconfirmation: { consentTokens: r.consentTokens, newSecret: newConsentSecret, hash: hashConsentSecret },
  };
}
