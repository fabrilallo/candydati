import { cvMatchesCriteria, needsStructuredCv, type Application, type Candidate, type CvExtractionRecord } from '@candydati/domain';
import type { CriteriaMatch, CriteriaSearchQuery, CriteriaSearchResult } from '../candidate-ports.js';
import type { CandidateStoreState } from './in-memory-candidates.js';

const isVisible = (own: readonly Application[]): boolean => own.some((a) => a.consentStatus === 'given') || !own.some((a) => a.consentStatus === 'to_renew');

const inPool = (query: CriteriaSearchQuery, candidate: Candidate, given: readonly Application[]): boolean => {
  const applicant = query.pool !== 'talent_pool' && given.some((a) => a.jobId === query.jobId);
  return applicant || (query.pool !== 'applicants' && candidate.talentPool);
};

const isEvaluable = (query: CriteriaSearchQuery, extraction: CvExtractionRecord): boolean =>
  extraction.status === 'done' || (extraction.status === 'text_only' && !needsStructuredCv(query.criteria));

/** The in-memory twin of the Postgres criteria search, on the reference semantics of `cvMatchesCriteria`. */
export function findByCriteriaInMemory(state: CandidateStoreState, query: CriteriaSearchQuery): CriteriaSearchResult {
  const pool = state.candidates
    .filter((candidate) => candidate.organizationId === query.organizationId)
    .map((candidate) => ({ candidate, own: state.applications.filter((a) => a.candidateId === candidate.id) }))
    .filter(({ own }) => isVisible(own))
    .filter(({ own }) => query.jobIds === undefined || own.some((a) => query.jobIds?.includes(a.jobId)))
    .map(({ candidate, own }) => ({ candidate, given: own.filter((a) => a.consentStatus === 'given') }))
    .filter(({ candidate, given }) => inPool(query, candidate, given))
    .map(({ candidate, given }) => ({ candidate, given, cvs: state.extractions.filter((e) => given.some((a) => a.id === e.applicationId)) }));
  const matches: CriteriaMatch[] = pool
    .filter(({ cvs }) => cvs.some((cv) => cvMatchesCriteria(cv, query.criteria)))
    .map(({ candidate, given }) => ({
      candidate,
      applicationId: given.find((a) => a.jobId === query.jobId)?.id ?? null,
      lastAppliedAt: given.length === 0 ? null : new Date(Math.max(...given.map((a) => a.createdAt.getTime()))),
    }))
    .toSorted((a, b) => (b.lastAppliedAt?.getTime() ?? 0) - (a.lastAppliedAt?.getTime() ?? 0) || a.candidate.id.localeCompare(b.candidate.id));
  const start = (query.page - 1) * query.limit;
  return {
    items: matches.slice(start, start + query.limit),
    total: matches.length,
    notEvaluable: pool.filter(({ cvs }) => !cvs.some((cv) => isEvaluable(query, cv))).length,
  };
}
