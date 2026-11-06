import { MAX_WEB_RESULTS, normalizeProfileUrl, personFromWebResult, WEB_QUERY_MAX, webEvidence, webResultSchema, type SourcingEvidence, type WebPerson } from '@candydati/domain';
import { z } from 'zod';
import { requireJob } from '../jobs/shared.js';
import { classifyPeople } from './contacts.js';
import { defineSourcingUseCase } from './define.js';

export interface FoundWebPerson {
  readonly person: WebPerson;
  readonly status: 'new' | 'already_contact' | 'already_candidate';
  readonly candidateId: string | null;
  readonly evidence: readonly SourcingEvidence[];
}

interface Candidate {
  readonly person: WebPerson;
  readonly key: string;
  readonly snippet: string;
}

/** The people the results point to, one per profile (the first result wins), in Google's order. */
function peopleOf(results: readonly z.output<typeof webResultSchema>[]): readonly Candidate[] {
  const seen = new Set<string>();
  return results.flatMap((result): Candidate[] => {
    const person = personFromWebResult(result);
    const key = person ? normalizeProfileUrl(person.profileUrl) : null;
    if (!person || !key || seen.has(key)) return [];
    seen.add(key);
    return [{ person, key, snippet: result.snippet }];
  });
}

/**
 * What a Google search in the recruiter's own browser (the Candydati extension) found for a job, made ready for the
 * assistant: the people the results point to (LinkedIn and GitHub profiles, pages titled with a person's name), the
 * snippet as the fact, and who is already a contact or a candidate; people who objected are left out. Public pages only,
 * so no organization setting nor risk acceptance; never more than MAX_WEB_RESULTS. Nothing is stored; the audit counts.
 */
export const prepareWebResults = defineSourcingUseCase({
  name: 'prepareWebResults',
  input: z.object({
    jobId: z.string().min(1),
    query: z.string().trim().min(1).max(WEB_QUERY_MAX),
    results: z.array(webResultSchema).max(MAX_WEB_RESULTS),
  }),
  permission: 'sourcing:manage',
  audit: {
    action: 'sourcing.web_read',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (input, result: readonly FoundWebPerson[]) => ({ results: input.results.length, people: result.length }),
  },
  handler: async ({ deps, actor, input }): Promise<readonly FoundWebPerson[]> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    const people = peopleOf(input.results);
    const verdicts = await classifyPeople(deps, actor.organizationId, job.id, people.map((p) => ({ key: p.key, email: null })));
    return people.flatMap((item, index): FoundWebPerson[] => {
      const verdict = verdicts[index] ?? null;
      if (verdict?.outcome === 'objected') return [];
      return [{ person: item.person, status: verdict === null ? 'new' : verdict.outcome, candidateId: verdict?.candidateId ?? null, evidence: webEvidence(input.query, item.snippet) }];
    });
  },
});
