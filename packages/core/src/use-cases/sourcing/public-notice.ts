import { constantTimeEqual, type SourcedContact, type SourcingEvidence, type SourcingSource } from '@candydati/domain';
import { z } from 'zod';
import { NotFoundError } from '../../errors.js';
import type { SourcingDeps } from '../../sourcing-ports.js';
import { definePublicCommand, definePublicQuery } from '../../use-case.js';
import { rememberObjection } from './contacts.js';

export const SOURCING_NOTICE_ACTOR_ID = 'sourcing_notice_page';

const tokenInput = z.object({ token: z.string().min(16).max(200) });
const NOT_VALID = 'This link is not valid.';

/** Unknown, rotated and erased links are all "not found"; the hash is compared again in constant time. */
async function resolve(deps: Pick<SourcingDeps, 'contacts' | 'hash' | 'now'>, secret: string): Promise<SourcedContact> {
  const hash = deps.hash(secret);
  const contact = await deps.contacts.findByNoticeHash(hash);
  if (!contact || !constantTimeEqual(contact.noticeTokenHash, hash) || contact.expiresAt <= deps.now()) throw new NotFoundError(NOT_VALID);
  return contact;
}

export interface SourcingNoticeView {
  readonly organizationName: string;
  readonly jobTitle: string;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly headline: string | null;
  readonly location: string | null;
  readonly source: SourcingSource;
  readonly profileUrl: string;
  readonly email: string | null;
  readonly evidence: readonly SourcingEvidence[];
  readonly collectedAt: Date;
  readonly expiresAt: Date;
  readonly language: 'it' | 'en';
}

/** Art. 15 for a sourced person: everything kept about them, from the link of their notice. Read-only. */
export const viewSourcingNotice = definePublicQuery<SourcingDeps, typeof tokenInput, SourcingNoticeView>({
  name: 'viewSourcingNotice',
  input: tokenInput,
  handler: async ({ deps, input }) => {
    const contact = await resolve(deps, input.token);
    const job = await deps.jobs.findById(contact.organizationId, contact.jobId);
    const organization = await deps.organizations.findById(contact.organizationId);
    return {
      organizationName: organization?.name ?? '',
      jobTitle: job?.content.title ?? '',
      language: job?.content.language ?? 'it',
      firstName: contact.firstName,
      lastName: contact.lastName,
      headline: contact.headline,
      location: contact.location,
      source: contact.source,
      profileUrl: contact.profileUrl,
      email: contact.email,
      evidence: contact.evidence,
      collectedAt: contact.createdAt,
      expiresAt: contact.expiresAt,
    };
  },
});

/**
 * Art. 17 and 21 from the notice link: the contact is erased at once and the organization keeps only keyed hashes of the
 * profile and email, so it never adds this person again. The audit names the job, never the person.
 */
export const objectToSourcing = definePublicCommand<SourcingDeps, typeof tokenInput, { readonly organizationId: string; readonly jobId: string }>({
  name: 'objectToSourcing',
  input: tokenInput,
  actorId: SOURCING_NOTICE_ACTOR_ID,
  audit: {
    action: 'sourced_contact.objected',
    organizationOf: (_input, result) => result.organizationId,
    target: (_input, result) => ({ type: 'job', id: result.jobId }),
  },
  handler: async ({ deps, input }) => {
    const contact = await resolve(deps, input.token);
    await rememberObjection(deps, contact);
    await deps.contacts.delete(contact.organizationId, contact.id);
    return { organizationId: contact.organizationId, jobId: contact.jobId };
  },
});
