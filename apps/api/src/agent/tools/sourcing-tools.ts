import { createTool } from '@mastra/core/tools';
import { addSourcedContacts, searchGithubPeople, type FoundPerson, type SourcingDeps } from '@candydati/core';
import { pseudonymizeText, sourcingEvidenceSchema } from '@candydati/domain';
import { z } from 'zod';
import { wrapCandidateData } from '../candidate-data.js';
import { readAgentIdentity } from '../request-context.js';
import type { Sealer } from '../sealed-ref.js';
import { refusal, runTool } from '../tool-result.js';

const id = z.string().min(1).max(100);
const UNKNOWN_NAME = 'GitHub user';

/** What a reference carries, sealed: everything needed to add the person, nothing the model reads. */
const sealedPersonSchema = z.object({
  jobId: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  location: z.string().nullable(),
  profileUrl: z.string(),
  evidence: z.array(sourcingEvidenceSchema),
});

/** First name and the rest of a display name; no name at all: a neutral label, never the login. */
const splitName = (name: string | null): { firstName: string; lastName: string | null } => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? { firstName: UNKNOWN_NAME, lastName: null } : { firstName: parts[0] ?? UNKNOWN_NAME, lastName: parts.slice(1).join(' ') || null };
};

/** What the model reads of one person: first name, city and evidence with the surname, login and links taken out. */
const forModel = (sealer: Sealer, organizationId: string, jobId: string, found: FoundPerson) => {
  const { firstName, lastName } = splitName(found.person.name);
  const identifiers = { lastName: lastName ?? '', linkedinUrl: found.person.profileUrl, otherNames: [found.person.login] };
  const clean = (text: string): string => pseudonymizeText(text, identifiers);
  const ref = sealer.seal(organizationId, { jobId, firstName, lastName, location: found.person.location, profileUrl: found.person.profileUrl, evidence: found.evidence });
  return {
    ref,
    firstName: wrapCandidateData(firstName),
    location: found.person.location ? wrapCandidateData(clean(found.person.location)) : null,
    status: found.status,
    evidence: found.evidence.map((item) => ({ criterion: item.criterion, fact: wrapCandidateData(clean(item.text)), where: item.where })),
  };
};

export const createSearchGithubPeopleTool = (deps: SourcingDeps, sealer: Sealer) =>
  createTool({
    id: 'search_github_people',
    description:
      'Sourcing: finds public GitHub accounts for ONE job on job-related criteria (languages of their own repositories, location, words in their bio), at most `limit` people (ask the user how many, 10 by default). ' +
      'Each result gives the first name, city, what GitHub shows per criterion, and whether the person is already a contact or a candidate; people who asked not to be contacted are left out. ' +
      'The order is GitHub join date, not a ranking: never say who is better, never pick or compare people. To build criteria from a reference person ("like Maja"), read their profile first and propose objective criteria the user confirms. ' +
      'Nothing is saved: to add people the user chose, call add_sourced_contacts with their `ref`.',
    inputSchema: z.object({
      jobId: id,
      languages: z.array(z.string().min(1).max(60)).max(5).default([]),
      location: z.string().min(1).max(60).nullable().default(null),
      keywords: z.array(z.string().min(1).max(60)).max(5).default([]),
      limit: z.number().int().min(1).max(30).default(10),
    }),
    execute: async (input, context) =>
      runTool(async () => {
        const { actor } = readAgentIdentity(context?.requestContext);
        const found = await searchGithubPeople(deps, actor, input);
        return { jobId: input.jobId, order: 'GitHub join date, newest first; not a ranking', count: found.length, people: found.map((item) => forModel(sealer, actor.organizationId, input.jobId, item)) };
      }),
  });

export const createAddSourcedContactsTool = (deps: SourcingDeps, sealer: Sealer) =>
  createTool({
    id: 'add_sourced_contacts',
    description:
      'Sourcing: adds the people the user chose from search_github_people as contacts of the job (never candidates). Pass their `ref` exactly as received. ' +
      'Before calling, list the people by first name and wait for the user to confirm; then set confirmedByUser. Each one is kept 30 days unless they apply; the user writes to them with the privacy notice from the job page. Never send messages yourself.',
    inputSchema: z.object({
      jobId: id,
      refs: z.array(z.string().min(1).max(4000)).min(1).max(30),
      confirmedByUser: z.literal(true).describe('true only after the user explicitly confirmed these people in this chat.'),
    }),
    execute: async (input, context) =>
      runTool(async () => {
        const { actor } = readAgentIdentity(context?.requestContext);
        const people = input.refs.map((ref) => sealer.unseal(actor.organizationId, ref, sealedPersonSchema));
        if (people.some((person) => person === null || person.jobId !== input.jobId)) return refusal('invalid_ref', 'A reference is unknown or expired: search again.');
        const contacts = people.flatMap((person) => (person ? [{ firstName: person.firstName, lastName: person.lastName, location: person.location, source: 'github' as const, profileUrl: person.profileUrl, evidence: person.evidence }] : []));
        const results = await addSourcedContacts(deps, actor, { jobId: input.jobId, contacts });
        return { results: results.map((result, index) => ({ firstName: wrapCandidateData(people[index]?.firstName ?? ''), outcome: result.outcome })) };
      }),
  });
