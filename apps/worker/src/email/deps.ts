import {
  createDrizzleApplications,
  createDrizzleAuditLog,
  createDrizzleCandidates,
  createDrizzleConversations,
  createDrizzleEmailSettings,
  createDrizzleMessages,
  createDrizzleOrganizationDirectory,
  type DeliverDeps,
  type EmailSender,
} from '@tt/core';
import type { Db } from '@tt/db';
import type { PlatformConfig } from '@tt/domain';
import type { EmailConfig } from '@tt/providers';
import { newConversationToken, toMessagingConfig } from '@tt/providers';

export interface EmailDeliveryWiring {
  readonly db: Db;
  readonly sender: EmailSender;
  readonly platform: PlatformConfig;
  readonly email: EmailConfig;
}

/** Drizzle repositories and the injected sender: what `deliverMessage` needs. */
export function createDeliverDeps({ db, sender, platform, email }: EmailDeliveryWiring): DeliverDeps {
  return {
    auditLog: createDrizzleAuditLog(db),
    organizations: createDrizzleOrganizationDirectory(db),
    candidates: createDrizzleCandidates(db),
    applications: createDrizzleApplications(db),
    settings: createDrizzleEmailSettings(db),
    conversations: createDrizzleConversations(db),
    messages: createDrizzleMessages(db),
    sender,
    config: toMessagingConfig(platform, email),
    newToken: newConversationToken,
    now: () => new Date(),
  };
}
