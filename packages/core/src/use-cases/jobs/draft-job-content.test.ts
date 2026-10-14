import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildJob, completeJobContent, createTestJobDeps, userActor } from '../../testing/index.js';
import { draftJobContent, type JobContentDrafter } from './draft-job-content.js';

const actor = userActor({ role: 'hiring_manager', organizationId: 'org_a' });

const recording = (result: unknown | Error) => {
  const calls: Parameters<JobContentDrafter>[0][] = [];
  const drafter: JobContentDrafter = async (input) => {
    calls.push(input);
    if (result instanceof Error) throw result;
    return result as never;
  };
  return { drafter, calls };
};

describe('draftJobContent', () => {
  it('asks the model with the brief and the current ad, validates the proposal and saves nothing', async () => {
    const deps = createTestJobDeps();
    const job = await deps.jobs.create(buildJob({ id: 'job_d', organizationId: 'org_a', content: completeJobContent({ title: 'Old title' }) }));
    const { drafter, calls } = recording(completeJobContent({ title: 'New title' }));
    const result = await draftJobContent({ ...deps, drafter }, actor, { brief: 'More remote', jobId: job.id, language: 'en' });
    expect(result).toMatchObject({ status: 'proposed', proposal: { title: 'New title' }, publishIssues: [] });
    expect(calls).toEqual([{ brief: 'More remote', base: job.content, language: 'en' }]);
    expect(deps.auditLog.events()).toEqual([]);
    expect((await deps.jobs.findById('org_a', job.id))?.content.title).toBe('Old title');
  });

  it('answers failed (never throws) when the model fails or returns something that is not a job ad', async () => {
    const errors: unknown[] = [];
    const onDraftError = (error: unknown) => errors.push(error);
    const down = await draftJobContent({ ...createTestJobDeps(), drafter: recording(new Error('timeout')).drafter, onDraftError }, actor, { brief: 'x' });
    const invalid = await draftJobContent({ ...createTestJobDeps(), drafter: recording({ nope: true }).drafter, onDraftError }, actor, { brief: 'x' });
    expect([down, invalid]).toEqual([{ status: 'failed' }, { status: 'failed' }]);
    expect(errors).toHaveLength(2);
  });

  it('needs job:update, a job of the organization and a brief', async () => {
    const { drafter } = recording(completeJobContent());
    await expect(draftJobContent({ ...createTestJobDeps(), drafter }, userActor({ role: 'interviewer', organizationId: 'org_a' }), { brief: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(draftJobContent({ ...createTestJobDeps(), drafter }, actor, { brief: 'x', jobId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(draftJobContent({ ...createTestJobDeps(), drafter }, actor, { brief: ' ' })).rejects.toBeInstanceOf(ValidationError);
  });
});
