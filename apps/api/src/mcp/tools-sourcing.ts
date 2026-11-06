import { addSourcedContacts, listSourcedContacts } from '@candydati/core';
import { MAX_EVIDENCE, MAX_SOURCED_PER_CALL, pseudonymizeText, SOURCING_SOURCES, type SourcedContact } from '@candydati/domain';
import { z } from 'zod';
import type { ToolDefinition } from './tool-support.js';

const jobId = z.string().min(1).max(100).describe('Id of the job the people are for (list_jobs).');

/** Plain shapes for the client; the use case validates the full rules (lengths, profile link) and names what is wrong. */
const evidenceShape = z.object({
  criterion: z.string().min(1).max(80).describe('A job-related criterion the person confirmed (a skill, a title, a city).'),
  text: z.string().min(1).max(500).describe('What the profile says about it, quoted or closely paraphrased: a fact, never a judgement.'),
  where: z.string().max(120).nullable().optional().describe('Where on the profile (section, repository).'),
});

const personShape = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).nullable().optional(),
  headline: z.string().max(200).nullable().optional().describe('The professional headline the profile shows.'),
  location: z.string().max(120).nullable().optional(),
  source: z.enum(SOURCING_SOURCES).describe('Where the person was found.'),
  profileUrl: z.string().min(1).max(500).describe('The public profile address (LinkedIn, GitHub, a personal page): one contact per profile and job.'),
  email: z.string().max(254).nullable().optional().describe('Only a professional address the source shows publicly; otherwise leave it out.'),
  evidence: z.array(evidenceShape).max(MAX_EVIDENCE).optional(),
});

const addShape = {
  jobId,
  people: z.array(personShape).min(1).max(MAX_SOURCED_PER_CALL),
  confirmedByUser: z.literal(true).describe('true only after the person explicitly confirmed these people in this conversation.'),
};

/**
 * People an external agent found on public professional profiles become contacts of a job, never candidates. The answer
 * names them by first name only and carries no notice link: writing to them is a person's job, from the app.
 */
export const addSourcedContactsTool = {
  name: 'add_sourced_contacts',
  title: 'Add sourced contacts to a job',
  description:
    'Adds people found outside Candydati (public professional profiles: LinkedIn, GitHub, a personal page) as sourced CONTACTS of one job, after the person confirmed them by name. They are not candidates and nobody is messaged: a person writes to them from the job\'s Sourcing tab, with the privacy notice the law requires. ' +
    'Each person: first name, surname, headline, location, source, profile link and evidence per criterion (a fact from the profile for each job-related criterion; no score, no ranking, no judgement). ' +
    'Skipped, and said so per person: already a contact of the job, already a candidate, or someone who asked never to be contacted (do not add them in any other way). Contacts nobody writes to are erased after 30 days. Needs the sourcing:manage scope.',
  shape: addShape,
  readOnly: false,
  run: async ({ app, actor }, input) => {
    const results = await addSourcedContacts(app.sourcingDeps, actor, { jobId: input.jobId, contacts: input.people });
    return {
      jobId: input.jobId,
      results: results.map((result, index) => ({ firstName: input.people[index]?.firstName ?? '', outcome: result.outcome, contactId: result.contactId })),
      messaged: false,
      next: 'Nobody was contacted. A person writes to each new contact from the job\'s Sourcing tab, with the privacy notice; contacts nobody writes to are erased after 30 days.',
    };
  },
} satisfies ToolDefinition<typeof addShape>;

/** A contact as an external agent reads it: first name, never the surname, the profile link or an email. */
function contactView(contact: SourcedContact) {
  const identifiers = { lastName: contact.lastName ?? '', email: contact.email, linkedinUrl: contact.profileUrl };
  const clean = (text: string | null): string | null => (text === null ? null : pseudonymizeText(text, identifiers));
  return {
    id: contact.id,
    firstName: contact.firstName,
    source: contact.source,
    status: contact.status,
    headline: clean(contact.headline),
    location: clean(contact.location),
    evidence: contact.evidence.map((item) => ({ criterion: item.criterion, text: clean(item.text), where: clean(item.where) })),
    contactedAt: contact.contactedAt?.toISOString() ?? null,
    expiresAt: contact.expiresAt.toISOString(),
  };
}

const listShape = { jobId };

export const listSourcedContactsTool = {
  name: 'list_sourced_contacts',
  title: 'List the sourced contacts of a job',
  description:
    'The people already added as sourced contacts of one job, by first name (never surname, profile link or email), with source, status (found, notified, contacted), the evidence per criterion and when they are erased if nobody writes to them. ' +
    'Use it to avoid bringing the same people again. No order of merit: never compare or rank them. Needs the sourcing:manage scope.',
  shape: listShape,
  readOnly: true,
  run: async ({ app, actor }, input) => ({
    jobId: input.jobId,
    contacts: (await listSourcedContacts(app.sourcingDeps, actor, input)).map(contactView),
  }),
} satisfies ToolDefinition<typeof listShape>;
