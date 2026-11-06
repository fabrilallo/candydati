import {
  contactExpiry,
  MAX_SOURCED_PER_CALL,
  normalizeProfileUrl,
  sourcedContactInputSchema,
  type Job,
  type SourcedContact,
  type SourcedContactData,
  type SourcingOutcome,
} from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { toActorUserId } from '../../actor-user.js';
import { ConflictError, NotFoundError } from '../../errors.js';
import type { SourcingDeps } from '../../sourcing-ports.js';
import { requireJob } from '../jobs/shared.js';
import { defineSourcingUseCase } from './define.js';
import { noticeFor, noticeUrl, rotateNotice } from './notice-mail.js';

const id = z.string().min(1);

export interface AddedContact {
  readonly profileUrl: string;
  readonly outcome: SourcingOutcome;
  readonly contactId: string | null;
  readonly candidateId: string | null;
  /** Only for `added`, and only in this answer: the personal art. 14 link to give the person in a first message. */
  readonly noticeUrl: string | null;
}

interface Known {
  readonly contactKeys: ReadonlySet<string>;
  readonly candidates: readonly { readonly id: string; readonly email: string; readonly key: string | null }[];
  readonly objected: ReadonlySet<string>;
}

async function known(deps: SourcingDeps, organizationId: string, jobId: string, people: readonly { key: string; email: string | null }[]): Promise<Known> {
  const profileKeys = people.map((p) => p.key);
  const emails = people.flatMap((p) => (p.email ? [p.email] : []));
  const contacts = await deps.contacts.findMatching(organizationId, { profileKeys, emails });
  const candidates = await deps.existingCandidates.findMatching(organizationId, { profileKeys, emails });
  const prints = [...profileKeys, ...emails].map((value) => deps.fingerprint(organizationId, value));
  return {
    contactKeys: new Set(contacts.filter((c) => c.jobId === jobId).flatMap((c) => [c.profileKey, ...(c.email ? [c.email] : [])])),
    candidates: candidates.map((c) => ({ id: c.id, email: c.email.toLowerCase(), key: c.linkedinUrl ? normalizeProfileUrl(c.linkedinUrl) : null })),
    objected: await deps.objections.existing(organizationId, prints),
  };
}

type Verdict = { readonly outcome: Exclude<SourcingOutcome, 'added'>; readonly candidateId: string | null } | null;

function verdictFor(deps: SourcingDeps, organizationId: string, k: Known, seen: ReadonlySet<string>, person: { key: string; email: string | null }): Verdict {
  const values = [person.key, ...(person.email ? [person.email] : [])];
  if (values.some((value) => k.objected.has(deps.fingerprint(organizationId, value)))) return { outcome: 'objected', candidateId: null };
  if (values.some((value) => k.contactKeys.has(value) || seen.has(value))) return { outcome: 'already_contact', candidateId: null };
  const candidate = k.candidates.find((c) => c.key === person.key || (person.email !== null && c.email === person.email));
  return candidate ? { outcome: 'already_candidate', candidateId: candidate.id } : null;
}

async function create(deps: SourcingDeps, actor: Actor, job: Job, data: SourcedContactData, key: string): Promise<{ contact: SourcedContact; secret: string }> {
  const secret = deps.newToken();
  const now = deps.now();
  const contact = await deps.contacts.create({
    ...data,
    id: deps.newId(),
    organizationId: job.organizationId,
    jobId: job.id,
    profileKey: key,
    status: 'found',
    noticeTokenHash: deps.hash(secret),
    noticeSentAt: null,
    contactedAt: null,
    expiresAt: contactExpiry(now),
    createdBy: toActorUserId(actor),
    createdAt: now,
  });
  if (contact.email) await deps.queue.enqueue('sourcing.notice', { organizationId: job.organizationId, contactId: contact.id }, { singletonKey: contact.id });
  return { contact, secret };
}

const countOf = (results: readonly AddedContact[], outcome: SourcingOutcome): number => results.filter((r) => r.outcome === outcome).length;

/**
 * People found outside Candydati become contacts of the job (never candidates: they did not apply). Skipped, never
 * merged: who objected, who is already a contact of the job or a candidate of the organization (same email or LinkedIn
 * profile), and repeats within the call. Each added contact expires in 30 days and has a personal art. 14 link; with a
 * known email the notice is emailed by the worker. The audit carries counts only, never who.
 */
export const addSourcedContacts = defineSourcingUseCase({
  name: 'addSourcedContacts',
  input: z.object({ jobId: id, contacts: z.array(sourcedContactInputSchema).min(1).max(MAX_SOURCED_PER_CALL) }),
  permission: 'sourcing:manage',
  audit: {
    action: 'sourced_contact.added',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (_input, results: readonly AddedContact[]) => ({ added: countOf(results, 'added'), skipped: results.length - countOf(results, 'added') }),
  },
  handler: async ({ deps, actor, input }): Promise<readonly AddedContact[]> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    if (job.status === 'closed') throw new ConflictError('A closed job takes no new contacts.');
    const people = input.contacts.map((data) => ({ data, key: normalizeProfileUrl(data.profileUrl) ?? '', email: data.email }));
    const k = await known(deps, actor.organizationId, job.id, people);
    const seen = new Set<string>();
    const results: AddedContact[] = [];
    for (const person of people) {
      const verdict = verdictFor(deps, actor.organizationId, k, seen, person);
      for (const value of [person.key, ...(person.email ? [person.email] : [])]) seen.add(value);
      if (verdict) {
        results.push({ profileUrl: person.data.profileUrl, ...verdict, contactId: null, noticeUrl: null });
        continue;
      }
      const { contact, secret } = await create(deps, actor, job, person.data, person.key);
      results.push({ profileUrl: person.data.profileUrl, outcome: 'added', contactId: contact.id, candidateId: null, noticeUrl: noticeUrl(deps, secret) });
    }
    return results;
  },
});

export const listSourcedContacts = defineSourcingUseCase({
  name: 'listSourcedContacts',
  input: z.object({ jobId: id }),
  permission: 'sourcing:manage',
  audit: { skip: 'listing: what was found is shown to who found it; the contacts are in the job they were added to' },
  handler: async ({ deps, actor, input }): Promise<readonly SourcedContact[]> => {
    await requireJob(deps, actor.organizationId, input.jobId);
    return deps.contacts.listByJob(actor.organizationId, input.jobId);
  },
});

/** The contact, reached through its job: a job-scoped actor sees only the contacts of their jobs. */
async function requireContact(deps: SourcingDeps, organizationId: string, contactId: string): Promise<{ contact: SourcedContact; job: Job }> {
  const contact = await deps.contacts.findById(organizationId, contactId);
  if (!contact) throw new NotFoundError('Contact not found.');
  return { contact, job: await requireJob(deps, organizationId, contact.jobId) };
}

/**
 * The short notice to paste into a first message (LinkedIn, email), with a fresh personal link: the previous link stops
 * working, so only the last message sent carries a live one.
 */
export const sourcedNoticeText = defineSourcingUseCase({
  name: 'sourcedNoticeText',
  input: z.object({ contactId: id }),
  permission: 'sourcing:manage',
  audit: { skip: 'renews a link only the person receives; nothing about them changes' },
  transaction: 'required',
  handler: async ({ deps, actor, input }): Promise<{ readonly text: string; readonly url: string }> => {
    const { contact, job } = await requireContact(deps, actor.organizationId, input.contactId);
    const secret = await rotateNotice(deps, contact);
    const { text, url } = await noticeFor(deps, contact, job, secret, true);
    return { text, url };
  },
});

/** A person wrote to them (with the notice in the message): from now on the notice duty is met. */
export const markSourcedContacted = defineSourcingUseCase({
  name: 'markSourcedContacted',
  input: z.object({ contactId: id }),
  permission: 'sourcing:manage',
  audit: { action: 'sourced_contact.contacted', target: (input) => ({ type: 'sourced_contact', id: input.contactId }) },
  handler: async ({ deps, actor, input }): Promise<SourcedContact> => {
    const { contact } = await requireContact(deps, actor.organizationId, input.contactId);
    const now = deps.now();
    return (await deps.contacts.update(actor.organizationId, contact.id, { status: 'contacted', contactedAt: contact.contactedAt ?? now })) ?? contact;
  },
});

/** Erases a contact. With `doNotContact` the organization also remembers (as keyed hashes only) never to add them again. */
export const deleteSourcedContact = defineSourcingUseCase({
  name: 'deleteSourcedContact',
  input: z.object({ contactId: id, doNotContact: z.boolean().default(false) }),
  permission: 'sourcing:manage',
  audit: {
    action: 'sourced_contact.deleted',
    target: (input) => ({ type: 'sourced_contact', id: input.contactId }),
    metadata: (input) => ({ doNotContact: input.doNotContact }),
  },
  handler: async ({ deps, actor, input }): Promise<{ readonly deleted: true }> => {
    const { contact } = await requireContact(deps, actor.organizationId, input.contactId);
    if (input.doNotContact) await rememberObjection(deps, contact);
    await deps.contacts.delete(actor.organizationId, contact.id);
    return { deleted: true };
  },
});

export async function rememberObjection(deps: Pick<SourcingDeps, 'objections' | 'fingerprint' | 'now'>, contact: SourcedContact): Promise<void> {
  const values = [contact.profileKey, ...(contact.email ? [contact.email] : [])];
  await deps.objections.add(contact.organizationId, values.map((value) => deps.fingerprint(contact.organizationId, value)), deps.now());
}
