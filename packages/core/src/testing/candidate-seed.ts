import {
  buildApplication,
  buildCandidate,
  buildExtraction,
  buildPrivacyNotice,
} from './candidate-fixtures.js';
import { createTestCandidateDeps, type TestCandidateDeps } from './candidate-deps.js';
import { createCandidateStore } from './in-memory-candidates.js';
import { createInMemoryJobRepository, createInMemoryOrganizationDirectory } from './in-memory-jobs.js';
import { createInMemoryJobTeams } from './in-memory-job-teams.js';
import { createInMemoryPrivacyNoticeRepository } from './in-memory-privacy.js';
import { buildJob } from './job-fixtures.js';
import type { Application, Candidate, CandidateNote, CvExtractionRecord, Job } from '@candydati/domain';

export const ORG_A = 'org_a';
export const ORG_B = 'org_b';

export interface SeedOptions {
  readonly candidates?: readonly Candidate[];
  readonly applications?: readonly Application[];
  readonly notes?: readonly CandidateNote[];
  readonly extractions?: readonly CvExtractionRecord[];
  readonly jobs?: readonly Job[];
  readonly overrides?: Partial<TestCandidateDeps>;
}

/**
 * Organization `org_a` (slug `acme`) with a published job `job_1` (slug `backend`, created by `user_test`, who is on its
 * team), an active notice v1, and one open candidate/application. Organization `org_b` (slug `beta`) exists with nothing in it.
 */
export function seedCandidateWorld(options: SeedOptions = {}): TestCandidateDeps {
  const store = createCandidateStore({
    candidates: options.candidates ?? [buildCandidate({ organizationId: ORG_A })],
    applications: options.applications ?? [buildApplication({ organizationId: ORG_A })],
    notes: options.notes ?? [],
    extractions: options.extractions ?? [buildExtraction({ organizationId: ORG_A })],
  });
  const jobs = options.jobs ?? [
    buildJob({ id: 'job_1', slug: 'backend', organizationId: ORG_A, status: 'published', publishedAt: new Date('2026-02-01T00:00:00Z') }),
  ];
  // Like the migration backfill: the creator of each job is on its team.
  const team = jobs.map((job) => ({ organizationId: job.organizationId, jobId: job.id, userId: job.createdBy, role: 'recruiter' as const, addedBy: 'system', createdAt: job.createdAt }));
  return createTestCandidateDeps({
    store,
    jobTeams: createInMemoryJobTeams(team, { store }),
    jobs: createInMemoryJobRepository(jobs),
    organizations: createInMemoryOrganizationDirectory([
      { id: ORG_A, name: 'Acme', slug: 'acme', logo: null },
      { id: ORG_B, name: 'Beta', slug: 'beta', logo: null },
    ]),
    privacyNotices: createInMemoryPrivacyNoticeRepository([buildPrivacyNotice({ organizationId: ORG_A })]),
    ...options.overrides,
  });
}
