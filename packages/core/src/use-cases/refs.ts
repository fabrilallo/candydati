import type { CandidateRepository, ApplicationRepository } from '../candidate-ports.js';
import type { JobRepository } from '../job-ports.js';
import { mapSequential } from '../sequential.js';

export interface CandidateRef {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
}

/** Candidate and job a list item points to. Missing or foreign ids resolve to null: a list never fails on a stale link. */
export interface Refs {
  candidateOf(applicationId: string | null): CandidateRef | null;
  jobTitleOf(jobId: string | null): string | null;
}

/** Loads, once per distinct id, the candidates behind `applicationIds` and the titles of `jobIds`. Always scoped to the organization. */
export async function loadRefs(
  deps: { readonly applications: ApplicationRepository; readonly candidates: CandidateRepository; readonly jobs: JobRepository },
  organizationId: string,
  applicationIds: readonly (string | null)[],
  jobIds: readonly (string | null)[],
): Promise<Refs> {
  const appIds = [...new Set(applicationIds.filter((id): id is string => id !== null))];
  const applications = (await mapSequential(appIds, (id) => deps.applications.findById(organizationId, id))).flatMap((a) => (a ? [a] : []));
  const candidates = await deps.candidates.findByIds(organizationId, [...new Set(applications.map((a) => a.candidateId))]);
  const wantedJobs = [...new Set([...jobIds, ...applications.map((a) => a.jobId)].filter((id): id is string => id !== null))];
  const jobs = (await mapSequential(wantedJobs, (id) => deps.jobs.findById(organizationId, id))).flatMap((j) => (j ? [j] : []));
  return {
    candidateOf: (applicationId) => {
      const application = applications.find((a) => a.id === applicationId);
      const candidate = candidates.find((c) => c.id === application?.candidateId);
      return candidate ? { id: candidate.id, firstName: candidate.firstName, lastName: candidate.lastName } : null;
    },
    jobTitleOf: (jobId) => jobs.find((j) => j.id === jobId)?.content.title ?? null,
  };
}
