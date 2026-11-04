import { buildProfileSharedNotice, buildShortlistEmail, shortlistPath, textToHtml, type Candidate, type ClientShortlist, type Job, type Message } from '@candydati/domain';
import type { ShortlistDeps, ShortlistMailParts } from '../../client-ports.js';
import type { PublicOrganization } from '../../job-ports.js';
import { enqueueDelivery } from '../messaging/send-message.js';
import { ensureConversation, formatFrom, oneLine, senderIdentity } from '../messaging/shared.js';

export interface ShortlistMailContext {
  readonly organization: PublicOrganization;
  readonly job: Job;
  readonly candidateCount: number;
}

/** Emails the personal link to the client contact. Never throws: a failed email is reported through `onError`. */
export async function sendShortlistEmail(
  deps: ShortlistMailParts,
  context: ShortlistMailContext,
  shortlist: Pick<ClientShortlist, 'recipientName' | 'recipientEmail' | 'expiresAt' | 'message'>,
  secret: string,
  reminder: boolean,
): Promise<boolean> {
  try {
    const identity = senderIdentity(deps.config, context.organization, null);
    const mail = buildShortlistEmail({
      locale: context.job.content.language,
      recipientName: shortlist.recipientName,
      agencyName: context.organization.name,
      jobTitle: context.job.content.title,
      candidateCount: context.candidateCount,
      message: shortlist.message,
      link: `${deps.config.platformUrl.replace(/\/$/, '')}${shortlistPath(secret)}`,
      expiresAt: shortlist.expiresAt,
      reminder,
      timeZone: deps.config.timeZone,
    });
    await deps.sender.send({
      from: formatFrom(identity),
      replyTo: identity.address,
      to: shortlist.recipientEmail,
      subject: oneLine(mail.subject),
      text: mail.text,
      html: textToHtml(mail.text),
      headers: { 'Auto-Submitted': 'auto-generated' },
    });
    return true;
  } catch (error) {
    deps.onError?.(error);
    return false;
  }
}

export interface ProfileNoticeInput {
  readonly organization: PublicOrganization;
  readonly job: Job;
  readonly applicationId: string;
  readonly candidate: Pick<Candidate, 'id' | 'firstName'>;
  /** Null when the client is confidential: the candidate is told it is a client of the agency, never another name. */
  readonly clientName: string | null;
  readonly sharedCv: boolean;
  readonly sharedNotes: boolean;
  /** The person who sent the shortlist: the notice is part of their action, like any message they send. */
  readonly sentBy: string;
}

/**
 * Tells the candidate their profile was presented to the client, through their conversation like every message (it shows on
 * the timeline and a reply comes back to the recruiter). Queued with the shortlist: it commits with it, or neither does.
 */
/** `deps` whole, as the use case got them: the delivery joins its transaction. */
export async function queueProfileNotice(deps: ShortlistDeps, input: ProfileNoticeInput): Promise<boolean> {
  const notice = buildProfileSharedNotice({
    locale: input.job.content.language,
    candidateFirstName: input.candidate.firstName,
    agencyName: input.organization.name,
    jobTitle: input.job.content.title,
    clientName: input.clientName,
    sharedCv: input.sharedCv,
    sharedNotes: input.sharedNotes,
  });
  await ensureConversation(deps, input.organization.id, input.applicationId);
  const message: Message = await deps.messages.create({
    id: deps.newId(),
    organizationId: input.organization.id,
    applicationId: input.applicationId,
    candidateId: input.candidate.id,
    direction: 'outbound',
    subject: oneLine(notice.subject),
    bodyText: notice.text,
    status: 'queued',
    providerMessageId: null,
    sentBy: input.sentBy,
    createdAt: deps.now(),
    sentAt: null,
    error: null,
    rawText: null,
    unverifiedSender: false,
    inboundMessageId: null,
    historical: false,
  });
  return enqueueDelivery(deps, message);
}
