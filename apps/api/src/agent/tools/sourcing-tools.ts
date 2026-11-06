import { createTool } from '@mastra/core/tools';
import { addSourcedContacts, searchGithubPeople, type FoundPerson, type SourcingDeps } from '@candydati/core';
import { MAX_WEB_RESULTS, pseudonymizeText, SOURCING_SOURCES, sourcingEvidenceSchema, WEB_QUERY_MAX, type SourcingEvidence, type SourcingSource } from '@candydati/domain';
import { z } from 'zod';
import { wrapCandidateData } from '../candidate-data.js';
import { readAgentIdentity } from '../request-context.js';
import type { Sealer } from '../sealed-ref.js';
import { refusal, runTool } from '../tool-result.js';

const id = z.string().min(1).max(100);
const UNKNOWN_NAME = 'GitHub user';

/** What a reference carries, sealed: everything needed to add the person, nothing the model reads. */
export const sealedPersonSchema = z.object({
  jobId: z.string(),
  source: z.enum(SOURCING_SOURCES),
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

/** One person found by sourcing, whatever the source, before it is sealed. */
export interface FoundForModel {
  readonly source: SourcingSource;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly location: string | null;
  readonly profileUrl: string;
  readonly status: 'new' | 'already_contact' | 'already_candidate';
  readonly evidence: readonly SourcingEvidence[];
  /** Strings that identify the person beyond the first name (a login, a slug): taken out of what the model reads. */
  readonly otherIdentifiers: readonly string[];
}

/** What the model reads of one person: first name, city and evidence with surname, handles and links taken out. */
export const sealedView = (sealer: Sealer, organizationId: string, jobId: string, found: FoundForModel) => {
  const identifiers = { lastName: found.lastName ?? '', linkedinUrl: found.profileUrl, otherNames: [...found.otherIdentifiers] };
  const clean = (text: string): string => pseudonymizeText(text, identifiers);
  const { otherIdentifiers: _ids, status: _status, ...sealed } = found;
  return {
    ref: sealer.seal(organizationId, { ...sealed, jobId }),
    firstName: wrapCandidateData(found.firstName),
    location: found.location ? wrapCandidateData(clean(found.location)) : null,
    status: found.status,
    evidence: found.evidence.map((item) => ({ criterion: item.criterion, fact: wrapCandidateData(clean(item.text)), where: item.where })),
  };
};

const fromGithub = (found: FoundPerson): FoundForModel => ({
  source: 'github',
  ...splitName(found.person.name),
  location: found.person.location,
  profileUrl: found.person.profileUrl,
  status: found.status,
  evidence: found.evidence,
  otherIdentifiers: [found.person.login],
});

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
        return { jobId: input.jobId, order: 'GitHub join date, newest first; not a ranking', count: found.length, people: found.map((item) => sealedView(sealer, actor.organizationId, input.jobId, fromGithub(item))) };
      }),
  });

export const createAddSourcedContactsTool = (deps: SourcingDeps, sealer: Sealer) =>
  createTool({
    id: 'add_sourced_contacts',
    description:
      'Sourcing: adds the people the user chose from search_github_people, search_linkedin_people or search_web_people as contacts of the job (never candidates). Pass their `ref` exactly as received. ' +
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
        const contacts = people.flatMap((person) => (person ? [{ firstName: person.firstName, lastName: person.lastName, location: person.location, source: person.source, profileUrl: person.profileUrl, evidence: person.evidence }] : []));
        const results = await addSourcedContacts(deps, actor, { jobId: input.jobId, contacts });
        return { results: results.map((result, index) => ({ firstName: wrapCandidateData(people[index]?.firstName ?? ''), outcome: result.outcome })) };
      }),
  });

/**
 * LinkedIn is read by the Candydati extension in the recruiter's own browser, not by the server: this tool has no
 * `execute`, so the run stops here and the web app runs it (the extension reads, the api seals) and sends the result back.
 */
export const createSearchLinkedinPeopleTool = () =>
  createTool({
    id: 'search_linkedin_people',
    description:
      'Sourcing: reads LinkedIn people search and profiles for ONE job, through the user\'s own browser and LinkedIn account (the Candydati extension), at most `limit` profiles (ask the user how many; the organization sets a maximum). ' +
      'The first time, the user is asked to accept that LinkedIn may restrict their account: if the result says not_accepted, extension_missing or linkedin_off, explain it plainly and stop. ' +
      'Results are like search_github_people: first name, city, the passages of the profile per criterion, already a contact or a candidate; never a ranking, never compare. Add the people the user chose with add_sourced_contacts.',
    inputSchema: z.object({
      jobId: id,
      keywords: z.array(z.string().min(1).max(60)).min(1).max(5).describe('Job-related words to search and to quote from the profiles (skills, titles).'),
      location: z.string().min(1).max(60).nullable().default(null),
      limit: z.number().int().min(1).max(100).default(10),
    }),
  });

/**
 * Google, searched in the recruiter's own browser by the Candydati extension (no search API, no server-side scraping):
 * like `search_linkedin_people`, no `execute`; the web app runs it and has the api seal the results.
 */
export const createSearchWebPeopleTool = () =>
  createTool({
    id: 'search_web_people',
    description:
      'Sourcing: searches Google for ONE job in the user\'s own browser (the Candydati extension) and returns the people the public results point to (LinkedIn and GitHub profiles, personal pages), at most `limit` results (ask the user how many, 10 by default). ' +
      'Write the search words yourself from objective job criteria, X-ray style when useful: `site:linkedin.com/in "Go" Torino`, `site:github.com Rust Milano`. Never search for protected traits (age, gender, origin, health, religion). ' +
      'Each result gives the first name, city if Google shows it, the Google snippet as the fact, and whether the person is already a contact or a candidate; people who asked not to be contacted are left out. The order is Google\'s, never a ranking: never compare people. ' +
      'If the result says extension_missing, captcha (Google asks the user to prove they are human: they do it in the tab, then you may search again), consent_required (the user accepts or refuses Google\'s cookie page in the tab first), cancelled or failed, explain it plainly and stop. Add the people the user chose with add_sourced_contacts.',
    inputSchema: z.object({
      jobId: id,
      query: z.string().trim().min(1).max(WEB_QUERY_MAX).describe('The Google search words, operators allowed (site:, quotes, OR).'),
      limit: z.number().int().min(1).max(MAX_WEB_RESULTS).default(10),
    }),
  });
