import { buildSourcingNotice, sourcingNoticePath, textToHtml, type Job, type SourcedContact } from '@candydati/domain';
import type { SourcingDeps, SourcingMailParts } from '../../sourcing-ports.js';
import { formatFrom, oneLine, senderIdentity } from '../messaging/shared.js';

export const noticeUrl = (deps: Pick<SourcingMailParts, 'config'>, secret: string): string => `${deps.config.platformUrl.replace(/\/$/, '')}${sourcingNoticePath(secret)}`;

/** A new secret for the contact's notice link: only its hash is stored, so an older link stops working. */
export async function rotateNotice(deps: Pick<SourcingDeps, 'contacts' | 'newToken' | 'hash'>, contact: SourcedContact): Promise<string> {
  const secret = deps.newToken();
  await deps.contacts.update(contact.organizationId, contact.id, { noticeTokenHash: deps.hash(secret) });
  return secret;
}

/** The notice in the job's language, full (email) or short (to paste in a first message). */
export async function noticeFor(deps: SourcingMailParts, contact: SourcedContact, job: Job, secret: string, short: boolean): Promise<{ subject: string; text: string; url: string }> {
  const organization = await deps.organizations.findById(contact.organizationId);
  const url = noticeUrl(deps, secret);
  const notice = buildSourcingNotice({
    locale: job.content.language,
    firstName: contact.firstName,
    organizationName: organization?.name ?? '',
    jobTitle: job.content.title,
    source: contact.source,
    link: url,
    expiresAt: contact.expiresAt,
    timeZone: deps.config.timeZone,
    short,
  });
  return { ...notice, url };
}

/** Emails the art. 14 notice from the organization's identity. Never throws: a failure is reported through `onError`. */
export async function sendNoticeEmail(deps: SourcingMailParts, contact: SourcedContact & { readonly email: string }, job: Job, secret: string): Promise<boolean> {
  try {
    const organization = await deps.organizations.findById(contact.organizationId);
    if (!organization) return false;
    const identity = senderIdentity(deps.config, organization, null);
    const notice = await noticeFor(deps, contact, job, secret, false);
    await deps.sender.send({
      from: formatFrom(identity),
      replyTo: identity.address,
      to: contact.email,
      subject: oneLine(notice.subject),
      text: notice.text,
      html: textToHtml(notice.text, { literals: [contact.firstName, job.content.title] }),
      headers: { 'Auto-Submitted': 'auto-generated' },
    });
    return true;
  } catch (error) {
    deps.onError?.(error);
    return false;
  }
}
