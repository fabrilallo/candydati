import { CONSENT_LINK, reconfirmEmail, SYSTEM_SENDER, type Locale } from '@candydati/domain';
import type { ConsentTokenRepository, ImportMailDeps } from '../../import-ports.js';
import type { ConversationRepository, MessageRepository } from '../../messaging-ports.js';
import { ensureConversation, oneLine } from '../messaging/shared.js';

/** Where the request is stored: the caller's transaction. */
export interface ReconfirmationRepositories {
  readonly consentTokens: ConsentTokenRepository;
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
}

export interface ReconfirmationDeps {
  readonly mail: Pick<ImportMailDeps, 'newToken'>;
  readonly newId: () => string;
  readonly newSecret: () => string;
  readonly hash: (secret: string) => string;
}

export interface ReconfirmationRequest {
  readonly organization: { readonly id: string; readonly name: string };
  readonly job: { readonly title: string; readonly language: Locale };
  readonly applicationId: string;
  readonly person: { readonly id: string; readonly firstName: string };
  /** When the link stops working: the end of the reconfirmation window. */
  readonly expiresAt: Date;
  readonly at: Date;
}

/**
 * The single-use consent token and the reconfirmation request (ADR 0008), queued as a system message. The token's hash
 * is of a secret nobody keeps: the delivery rotates it at send time and only the email ever holds a working secret. The
 * body keeps the `CONSENT_LINK` placeholder, so no link is ever stored. Returns the message id, whose delivery the
 * caller queues once the transaction commits.
 */
export async function storeReconfirmationRequest(deps: ReconfirmationDeps, repos: ReconfirmationRepositories, request: ReconfirmationRequest): Promise<string> {
  const { organization, applicationId, at } = request;
  await repos.consentTokens.create({ tokenHash: deps.hash(deps.newSecret()), organizationId: organization.id, applicationId, expiresAt: request.expiresAt, usedAt: null, createdAt: at });
  const email = reconfirmEmail({
    language: request.job.language,
    firstName: request.person.firstName,
    organizationName: organization.name,
    jobTitle: request.job.title,
    url: CONSENT_LINK,
  });
  await ensureConversation({ conversations: repos.conversations, newToken: deps.mail.newToken }, organization.id, applicationId);
  const message = await repos.messages.create({
    id: deps.newId(),
    organizationId: organization.id,
    applicationId,
    candidateId: request.person.id,
    direction: 'outbound',
    subject: oneLine(email.subject),
    bodyText: email.body,
    status: 'queued',
    providerMessageId: null,
    sentBy: SYSTEM_SENDER,
    createdAt: at,
    sentAt: null,
    error: null,
    rawText: null,
    unverifiedSender: false,
    inboundMessageId: null,
    historical: false,
  });
  return message.id;
}
