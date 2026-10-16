import { createHash } from 'node:crypto';
import type { FeedbackDeps, FeedbackStageEntryParts } from '../feedback-ports.js';
import type { JobRequestDeps, StaleJobDeps, StaleScanDeps } from '../job-request-ports.js';
import { createInMemoryJobRequests, createInMemoryStaleJobs, type InMemoryJobRequests } from './in-memory-job-requests.js';
import { seedPrivacyWorld, type PrivacySeedOptions, type TestPrivacyDeps } from './privacy-deps.js';

export const testHash = (secret: string): string => createHash('sha256').update(secret).digest('hex');

export type TestHrDeps = TestPrivacyDeps &
  FeedbackDeps &
  JobRequestDeps &
  StaleJobDeps &
  StaleScanDeps & {
    readonly jobRequests: InMemoryJobRequests;
    /** Always wired in the HR world (the optional `feedback` of the candidate deps is set). */
    readonly feedback: FeedbackStageEntryParts;
  };

export interface HrSeedOptions extends PrivacySeedOptions {
  readonly hrOverrides?: Partial<TestHrDeps>;
}

/**
 * The privacy world (`org_a`, job `job_1` with two declared stages `stage-0` hr_interview and `stage-1`
 * technical_interview, open application `app_1`) plus the Phase 9 ports: feedback, job requests with approval, and stale
 * ads. `deps.feedback` is set, so moving an application asks the configured interviewers for feedback.
 */
export function seedHrWorld(options: HrSeedOptions = {}): TestHrDeps {
  const world = seedPrivacyWorld(options);
  const base = {
    ...world,
    hash: testHash,
    jobRequests: createInMemoryJobRequests(),
    staleJobs: createInMemoryStaleJobs(world.jobs, world.store),
  };
  return {
    ...base,
    feedback: {
      feedbackRequests: base.feedbackRequests,
      interviewFeedback: base.interviewFeedback,
      stageInterviewers: base.stageInterviewers,
      members: base.members,
      organizations: base.organizations,
      sender: base.sender,
      config: base.config,
      newToken: base.newToken,
      hash: base.hash,
    },
    ...options.hrOverrides,
  } as TestHrDeps;
}
