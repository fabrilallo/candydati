import { describe, expect, it } from 'vitest';
import { ORG_A, seedHrWorld, userActor, type TestHrDeps } from '../../testing/index.js';
import { decideApplication } from '../candidates/decide-application.js';
import { moveApplication } from '../candidates/move-application.js';
import { setJobInterviewers } from './interviewers.js';
import { submitFeedback } from './public.js';

const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const GOOD = { answers: { tech_shown: 'Solid design sense', tech_open: 'Concurrency' }, recommendation: 'proceed' as const };
const secretsOf = (deps: TestHrDeps): string[] => deps.sender.sent().flatMap((mail) => [...mail.text.matchAll(/\/feedback\/([a-z]+)/g)].map((m) => m[1] as string));
const feedbackRuns = (deps: TestHrDeps) => deps.queue.jobs().filter((job) => job.name === 'automation.run' && 'trigger' in job.payload && job.payload.trigger === 'feedback_submitted');

async function asked(): Promise<{ deps: TestHrDeps; secret: string }> {
  const deps = seedHrWorld();
  await setJobInterviewers(deps, recruiter, { jobId: 'job_1', stages: [{ stageId: 'stage-1', interviewers: [{ kind: 'member', userId: 'hm_1' }] }] });
  await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
  return { deps, secret: secretsOf(deps)[0] as string };
}

describe('submitFeedback: the feedback submitted trigger', () => {
  it('queues the feedback_submitted rules of the stage the feedback was asked for, with the feedback', async () => {
    const { deps, secret } = await asked();
    // The candidate moved on before the interviewer wrote: the feedback still belongs to stage-1.
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' });
    await submitFeedback(deps, { token: secret, ...GOOD });
    const [feedback] = deps.feedbackStore.read().feedback;
    expect(feedbackRuns(deps)).toEqual([
      { name: 'automation.run', payload: { organizationId: ORG_A, applicationId: 'app_1', stageId: 'stage-1', trigger: 'feedback_submitted', occurrence: `feedback:${feedback?.id}` } },
    ]);
  });

  it('does not fire for a decided application', async () => {
    const { deps, secret } = await asked();
    await decideApplication(deps, recruiter, { applicationId: 'app_1', outcome: 'not_selected' });
    await submitFeedback(deps, { token: secret, ...GOOD }).catch(() => null);
    expect(feedbackRuns(deps)).toEqual([]);
  });
});
