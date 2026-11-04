import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { apiKeyActor, ORG_A, seedHrWorld, userActor, type TestHrDeps } from '../../testing/index.js';
import { getJobScorecard, setJobScorecard } from './scorecard.js';

const NOW = new Date('2026-06-01T10:00:00.000Z');
const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const manager = userActor({ id: 'hm_1', role: 'hiring_manager', organizationId: ORG_A });
const interviewer = userActor({ id: 'int_1', role: 'interviewer', organizationId: ORG_A });

const world = (): TestHrDeps => seedHrWorld();
const labels = async (deps: TestHrDeps) => (await getJobScorecard(deps, recruiter, { jobId: 'job_1' })).criteria.map((c) => [c.label, c.stageId, c.locked]);

describe('job scorecard', () => {
  it('declares criteria for every stage or one, in order, audited with counts only', async () => {
    const deps = world();
    const view = await setJobScorecard(deps, recruiter, {
      jobId: 'job_1',
      criteria: [{ label: 'Postgres experience' }, { label: 'Client communication', stageId: 'stage-0' }, { label: 'English B2', stageId: 'stage-1' }],
    });
    expect(view.criteria.map((c) => [c.label, c.stageId, c.position, c.locked])).toEqual([
      ['Postgres experience', null, 0, false],
      ['Client communication', 'stage-0', 1, false],
      ['English B2', 'stage-1', 2, false],
    ]);
    const event = deps.auditLog.events().find((e) => e.action === 'job.scorecard_updated');
    expect(event).toMatchObject({ target: { type: 'job', id: 'job_1' }, metadata: { created: 3, changed: 0, retired: 0, removed: 0 } });
    expect(JSON.stringify(event)).not.toContain('Postgres');
  });

  it('edits and deletes criteria freely until a feedback uses them', async () => {
    const deps = world();
    const first = await setJobScorecard(deps, recruiter, { jobId: 'job_1', criteria: [{ label: 'Postgres' }, { label: 'English' }] });
    const [pg] = first.criteria;
    await setJobScorecard(deps, recruiter, { jobId: 'job_1', criteria: [{ id: pg!.id, label: 'Postgres experience', stageId: 'stage-1' }] });
    expect(await labels(deps)).toEqual([['Postgres experience', 'stage-1', false]]);
    expect(deps.feedbackStore.read().criteria).toHaveLength(1);
  });

  it('after the first feedback a criterion is append-only: it keeps its words and is retired, never deleted', async () => {
    const deps = world();
    const first = await setJobScorecard(deps, recruiter, { jobId: 'job_1', criteria: [{ label: 'Postgres' }, { label: 'English' }] });
    const [pg, en] = first.criteria;
    await deps.scorecards.markUsed(ORG_A, [pg!.id], NOW);
    expect((await getJobScorecard(deps, recruiter, { jobId: 'job_1' })).criteria[0]).toMatchObject({ locked: true });
    await expect(setJobScorecard(deps, recruiter, { jobId: 'job_1', criteria: [{ id: pg!.id, label: 'Postgres (changed)' }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(setJobScorecard(deps, recruiter, { jobId: 'job_1', criteria: [{ id: pg!.id, label: 'Postgres', stageId: 'stage-0' }] })).rejects.toBeInstanceOf(ValidationError);
    const reordered = await setJobScorecard(deps, recruiter, { jobId: 'job_1', criteria: [{ id: en!.id, label: 'English' }, { id: pg!.id, label: 'Postgres' }] });
    expect(reordered.criteria.map((c) => c.label)).toEqual(['English', 'Postgres']);
    await setJobScorecard(deps, recruiter, { jobId: 'job_1', criteria: [{ label: 'Postgres, with a new wording' }] });
    expect(await labels(deps)).toEqual([['Postgres, with a new wording', null, false]]);
    const stored = deps.feedbackStore.read().criteria;
    expect(stored.find((c) => c.id === pg!.id)?.retiredAt).not.toBeNull();
    expect(stored.find((c) => c.id === en!.id)).toBeUndefined();
    expect(deps.auditLog.events().filter((e) => e.action === 'job.scorecard_updated').at(-1)?.metadata).toEqual({ created: 1, changed: 0, retired: 1, removed: 1 });
  });

  it('refuses unknown stages and criteria, duplicates, too many and any weight', async () => {
    const deps = world();
    const attempt = (criteria: unknown) => setJobScorecard(deps, recruiter, { jobId: 'job_1', criteria });
    await expect(attempt([{ label: 'A', stageId: 'received' }])).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt([{ label: 'A', stageId: 'stage-9' }])).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt([{ id: 'nope', label: 'A' }])).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt([{ label: 'English' }, { label: ' english ' }])).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt(Array.from({ length: 21 }, (_, i) => ({ label: `C${i}` })))).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt([{ label: 'A', weight: 2 }])).rejects.toBeInstanceOf(ValidationError);
  });

  it('role matrix: managed by owner, admin, recruiter, hiring manager and their keys; read by interviewers; scoped to the job', async () => {
    const deps = world();
    await deps.jobTeams.upsert({ organizationId: ORG_A, jobId: 'job_1', userId: 'hm_1', role: 'hiring_manager', addedBy: 'system', createdAt: NOW });
    await deps.jobTeams.upsert({ organizationId: ORG_A, jobId: 'job_1', userId: 'int_1', role: 'interviewer', addedBy: 'system', createdAt: NOW });
    await setJobScorecard(deps, manager, { jobId: 'job_1', criteria: [{ label: 'Postgres' }] });
    await setJobScorecard(deps, apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'recruiter_1', role: 'recruiter' }), { jobId: 'job_1', criteria: [{ label: 'Postgres' }, { label: 'English' }] });
    expect((await getJobScorecard(deps, interviewer, { jobId: 'job_1' })).criteria).toHaveLength(2);
    await expect(setJobScorecard(deps, interviewer, { jobId: 'job_1', criteria: [] })).rejects.toBeInstanceOf(ForbiddenError);
    const outsider = userActor({ id: 'int_9', role: 'interviewer', organizationId: ORG_A });
    await expect(getJobScorecard(deps, outsider, { jobId: 'job_1' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
