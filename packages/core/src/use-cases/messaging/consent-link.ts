import { IMPORT_RECONFIRM_DAYS, interviewOfBody, isConsentRequestBody, renderConsentLink, renderInterviewLinks, SYSTEM_SENDER, DAY_MS, type Message } from '@candydati/domain';
import type { DeliverDeps } from '../../messaging-ports.js';

/** The person answered (or was erased) since the message was queued: nothing to ask any more. */
export const CONSENT_NOT_PENDING = 'consent_not_pending';
/** A reconfirmation request reached a delivery wired without the consent tokens: never sent without its link. */
export const CONSENT_LINK_UNAVAILABLE = 'consent_link_unavailable';
/** The interview was booked, cancelled or removed since the invitation was queued: its link must not go out. */
export const INTERVIEW_NOT_PENDING = 'interview_not_pending';
/** An interview invitation reached a delivery wired without the interviews: never sent without its link. */
export const INTERVIEW_LINK_UNAVAILABLE = 'interview_link_unavailable';

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
  const interviewId = interviewOfBody(message.bodyText);
  if (interviewId !== null) return interviewOutgoing(deps, message, interviewId);
  if (!isReconfirmation(message)) return { text: message.bodyText, idempotencyKey: message.id };
  const consent = deps.reconfirmation;
  if (!consent) return { error: CONSENT_LINK_UNAVAILABLE };
  const secret = consent.newSecret();
  const tokenHash = consent.hash(secret);
  if (!(await consent.consentTokens.rotate(message.organizationId, message.applicationId, tokenHash, windowFrom(deps.now())))) return { error: CONSENT_NOT_PENDING };
  return { text: renderConsentLink(message.bodyText, `${deps.config.platformUrl}/consent/${secret}`), idempotencyKey: `${message.id}:${tokenHash.slice(0, 16)}` };
}

/**
 * An interview invitation gets its link now, as a reconfirmation does: a fresh secret whose hash replaces the stored one,
 * and the links of the times it offers. Only for an interview of this same application that is still to be booked, so a
 * placeholder typed into another message can never send someone else's link.
 */
async function interviewOutgoing(deps: DeliverDeps, message: Message, interviewId: string): Promise<Outgoing | { readonly error: string }> {
  const links = deps.interviewLinks;
  if (!links) return { error: INTERVIEW_LINK_UNAVAILABLE };
  const interview = await links.interviews.findById(message.organizationId, interviewId);
  if (!interview || interview.status !== 'proposed' || interview.applicationId !== message.applicationId) return { error: INTERVIEW_NOT_PENDING };
  const secret = links.newSecret();
  const tokenHash = links.hash(secret);
  const rotated = await links.interviews.update(message.organizationId, interview.id, { statuses: ['proposed'], icsSequence: interview.icsSequence }, { tokenHash, updatedAt: deps.now() });
  if (!rotated) return { error: INTERVIEW_NOT_PENDING };
  return { text: renderInterviewLinks(message.bodyText, interview.id, deps.config.platformUrl, secret), idempotencyKey: `${message.id}:${tokenHash.slice(0, 16)}` };
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
