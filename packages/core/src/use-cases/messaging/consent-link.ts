import { IMPORT_RECONFIRM_DAYS, isConsentRequestBody, renderConsentLink, SYSTEM_SENDER, DAY_MS, type Message } from '@candydati/domain';
import type { DeliverDeps } from '../../messaging-ports.js';

/** The person answered (or was erased) since the message was queued: nothing to ask any more. */
export const CONSENT_NOT_PENDING = 'consent_not_pending';
/** A reconfirmation request reached a delivery wired without the consent tokens: never sent without its link. */
export const CONSENT_LINK_UNAVAILABLE = 'consent_link_unavailable';

/** What the delivery sends: the text, and the idempotency key the provider deduplicates on. */
export interface Outgoing {
  readonly text: string;
  readonly idempotencyKey: string;
}

/** A system message holding the consent-link placeholder: the import reconfirmation request. */
export const isReconfirmation = (message: Pick<Message, 'sentBy' | 'bodyText'>): boolean =>
  message.sentBy === SYSTEM_SENDER && isConsentRequestBody(message.bodyText);

const windowFrom = (at: Date): Date => new Date(at.getTime() + IMPORT_RECONFIRM_DAYS * DAY_MS);

/**
 * The text to send. A reconfirmation request gets its link now, with a fresh single-use secret: only the hash is stored
 * (the token rotates, so the link of an earlier attempt stops working) and the secret exists only in this email. The
 * key includes the new hash, so a resend after a rotation is a new email rather than one the provider drops.
 */
export async function outgoingFor(deps: DeliverDeps, message: Message): Promise<Outgoing | { readonly error: string }> {
  if (!isReconfirmation(message)) return { text: message.bodyText, idempotencyKey: message.id };
  const consent = deps.reconfirmation;
  if (!consent) return { error: CONSENT_LINK_UNAVAILABLE };
  const secret = consent.newSecret();
  const tokenHash = consent.hash(secret);
  if (!(await consent.consentTokens.rotate(message.organizationId, message.applicationId, tokenHash, windowFrom(deps.now())))) return { error: CONSENT_NOT_PENDING };
  return { text: renderConsentLink(message.bodyText, `${deps.config.platformUrl}/consent/${secret}`), idempotencyKey: `${message.id}:${tokenHash.slice(0, 16)}` };
}

/**
 * Inside the outcome transaction of a sent reconfirmation: the person has now been asked. Their window starts from this
 * email, never from the import, so a late delivery still leaves them the full IMPORT_RECONFIRM_DAYS.
 */
export async function recordReconfirmationSent(deps: Pick<DeliverDeps, 'applications'>, message: Message, sentAt: Date): Promise<void> {
  if (!isReconfirmation(message)) return;
  const application = await deps.applications.findById(message.organizationId, message.applicationId);
  if (!application || application.consentStatus !== 'to_renew') return;
  const until = windowFrom(sentAt);
  await deps.applications.update(message.organizationId, application.id, {
    reconfirmationSentAt: application.reconfirmationSentAt ?? sentAt,
    retentionExpiresAt: application.retentionExpiresAt > until ? application.retentionExpiresAt : until,
  });
}
