import { normalizeProfileUrl, type Job, type SourcingEvidence } from '@candydati/domain';
import { z } from 'zod';
import { ConflictError, RateLimitedError, SourceUnavailableError } from '../../errors.js';
import type { GithubPerson } from '../../sourcing-ports.js';
import { requireJob } from '../jobs/shared.js';
import { classifyPeople } from './contacts.js';
import { defineSourcingUseCase } from './define.js';

export const MAX_GITHUB_RESULTS = 30;
const term = z.string().trim().min(1).max(60);

export interface FoundPerson {
  readonly person: GithubPerson;
  readonly status: 'new' | 'already_contact' | 'already_candidate';
  readonly candidateId: string | null;
  /** What GitHub shows about each criterion asked for. Facts, never a score. */
  readonly evidence: readonly SourcingEvidence[];
}

const REPOS: Readonly<Record<Job['content']['language'], (count: number, language: string) => string>> = {
  it: (count, language) => `${count} repository pubblici in ${language}`,
  en: (count, language) => `${count} public repositories in ${language}`,
};

const BIO_MAX = 300;

/** For each criterion asked for, what the profile shows about it; a criterion it shows nothing about is left out. */
function evidenceOf(person: GithubPerson, query: { languages: readonly string[]; location: string | null; keywords: readonly string[] }, language: Job['content']['language']): SourcingEvidence[] {
  const languages = query.languages.flatMap((wanted) => {
    const found = person.languages.find((item) => item.language.toLowerCase() === wanted.toLowerCase());
    return found ? [{ criterion: wanted, text: REPOS[language](found.repos, found.language), where: 'GitHub' }] : [];
  });
  const location = query.location && person.location ? [{ criterion: query.location, text: person.location, where: 'GitHub' }] : [];
  const bio = person.bio ? person.bio.slice(0, BIO_MAX) : null;
  const keywords = bio ? query.keywords.filter((word) => bio.toLowerCase().includes(word.toLowerCase())).map((word) => ({ criterion: word, text: bio, where: 'GitHub bio' })) : [];
  return [...languages, ...location, ...keywords];
}

/**
 * Searches public GitHub accounts for a job on job-related criteria (languages of their repositories, location, words in
 * the bio). Each result says what GitHub shows per criterion and whether the person is already a contact or a candidate;
 * people who objected are left out. GitHub orders by join date: never a ranking. Nothing is stored: adding is a separate,
 * confirmed step.
 */
export const searchGithubPeople = defineSourcingUseCase({
  name: 'searchGithubPeople',
  input: z
    .object({
      jobId: z.string().min(1),
      languages: z.array(term).max(5).default([]),
      location: term.nullable().default(null),
      keywords: z.array(term).max(5).default([]),
      limit: z.number().int().min(1).max(MAX_GITHUB_RESULTS).default(10),
    })
    .refine((query) => query.languages.length + query.keywords.length + (query.location ? 1 : 0) > 0, { message: 'criteria_required' }),
  permission: 'sourcing:manage',
  audit: { skip: 'a search of public profiles: nothing is stored until a person adds someone' },
  handler: async ({ deps, actor, input }): Promise<readonly FoundPerson[]> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    if (!deps.github) throw new ConflictError('GitHub search is not configured on this instance.');
    const { jobId: _jobId, ...query } = input;
    const people = await deps.github.search(query).catch((error: unknown) => {
      throw (error as { reason?: unknown }).reason === 'rate_limited' ? new RateLimitedError('GitHub limits how many searches can run: try again later.') : new SourceUnavailableError(error);
    });
    const verdicts = await classifyPeople(deps, actor.organizationId, job.id, people.map((p) => ({ key: normalizeProfileUrl(p.profileUrl) ?? p.profileUrl, email: null })));
    return people.flatMap((person, index): FoundPerson[] => {
      const verdict = verdicts[index] ?? null;
      if (verdict?.outcome === 'objected') return [];
      const status = verdict === null ? 'new' : verdict.outcome;
      return [{ person, status, candidateId: verdict?.candidateId ?? null, evidence: evidenceOf(person, query, job.content.language) }];
    });
  },
});
