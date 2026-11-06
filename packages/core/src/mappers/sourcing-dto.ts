import type { AddSourcedResultDto, SourcedContact, SourcedContactDto, SourcingNoticeViewDto } from '@candydati/domain';
import type { AddedContact } from '../use-cases/sourcing/contacts.js';
import type { SourcingNoticeView } from '../use-cases/sourcing/public-notice.js';

const iso = (date: Date): string => date.toISOString();

/** Everything but the notice hash and the organization. */
export const toSourcedContactDto = (contact: SourcedContact): SourcedContactDto => ({
  id: contact.id,
  jobId: contact.jobId,
  firstName: contact.firstName,
  lastName: contact.lastName,
  headline: contact.headline,
  location: contact.location,
  source: contact.source,
  profileUrl: contact.profileUrl,
  email: contact.email,
  evidence: contact.evidence.map((item) => ({ ...item })),
  status: contact.status,
  noticeSentAt: contact.noticeSentAt ? iso(contact.noticeSentAt) : null,
  contactedAt: contact.contactedAt ? iso(contact.contactedAt) : null,
  expiresAt: iso(contact.expiresAt),
  createdBy: contact.createdBy,
  createdAt: iso(contact.createdAt),
});

export const toAddSourcedResultDto = (result: AddedContact): AddSourcedResultDto => ({ ...result });

export const toSourcingNoticeViewDto = (view: SourcingNoticeView): SourcingNoticeViewDto => ({
  ...view,
  evidence: view.evidence.map((item) => ({ ...item })),
  collectedAt: iso(view.collectedAt),
  expiresAt: iso(view.expiresAt),
});
