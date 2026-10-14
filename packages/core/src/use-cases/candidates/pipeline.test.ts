import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import {
  buildApplication,
  buildCandidate,
  buildExtraction,
  buildJob,
  completeJobContent,
  buildNote,
  createInMemoryTaskQueue,
  seedCandidateWorld,
  userActor,
  ORG_A,
  ORG_B,
} from '../../testing/index.js';
import { decideApplication } from './decide-application.js';
import { getPipeline } from './get-pipeline.js';
import { moveApplication } from './move-application.js';
import { AutomationEnqueueError } from '../automations/enqueue.js';
import { createInMemoryTransaction } from '../../testing/in-memory-transaction.js';

const recruiter = userActor({ role: 'recruiter', organizationId: ORG_A });
const world = () =>
  seedCandidateWorld({
    candidates: [buildCandidate({ organizationId: ORG_A }), buildCandidate({ id: 'cand_2', organizationId: ORG_A, email: 'b@x.it', firstName: 'Bo' })],
    applications: [
      buildApplication({ organizationId: ORG_A }),
      buildApplication({ id: 'app_2', candidateId: 'cand_2', organizationId: ORG_A, stageId: 'stage-0', createdAt: new Date('2026-02-01T00:00:00Z') }),
      buildApplication({ id: 'app_3', candidateId: 'cand_2', organizationId: ORG_A, stageId: 'stage-1', outcome: 'hired', closedAt: new Date() }),
    ],
    notes: [buildNote({ organizationId: ORG_A, applicationId: 'app_1' }), buildNote({ id: 'n2', organizationId: ORG_A, applicationId: 'app_1' })],
    extractions: [buildExtraction({ organizationId: ORG_A })],
  });

describe('getPipeline', () => {
  it('returns stages from the declared process with open counts, and every application as a card', async () => {
    const view = await getPipeline(world(), recruiter, { jobId: 'job_1' });
    expect(view.stages.map((s) => [s.stage.id, s.count])).toEqual([['received', 1], ['stage-0', 1], ['stage-1', 0]]);
    expect(view.stages[1]?.stage.declared?.type).toBe('hr_interview');
    expect(view.cards.map((c) => c.application.id)).toEqual(['app_2', 'app_1', 'app_3']);
    const first = view.cards.find((c) => c.application.id === 'app_1');
    expect(first).toMatchObject({ noteCount: 2, candidate: { id: 'cand_1' }, extraction: { status: 'done' } });
    expect(view.cards.find((c) => c.application.id === 'app_2')).toMatchObject({ noteCount: 0, extraction: null });
  });

  it('is audit-free and allowed to every role with candidate:read', async () => {
    for (const role of ['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'] as const) {
      const d = world();
      await expect(getPipeline(d, userActor({ role, organizationId: ORG_A }), { jobId: 'job_1' })).resolves.toBeDefined();
      expect(d.auditLog.events()).toHaveLength(0);
    }
  });

  it('is not found for a job of another organization and forbidden across organizations', async () => {
    await expect(getPipeline(world(), userActor({ role: 'owner', organizationId: ORG_B }), { jobId: 'job_1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPipeline(world(), recruiter, {})).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('moveApplication', () => {
  it('moves between existing stages, stamps the change and audits only stage ids', async () => {
    const d = world();
    const result = await moveApplication(d, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    expect(result.from).toBe('received');
    expect(result.application).toMatchObject({ stageId: 'stage-1', stageChangedAt: d.now(), updatedAt: d.now(), outcome: null });
    expect((await d.applications.findById(ORG_A, 'app_1'))?.stageId).toBe('stage-1');
    expect(d.auditLog.events()[0]).toMatchObject({
      action: 'application.moved',
      target: { type: 'application', id: 'app_1' },
      metadata: { from: 'received', to: 'stage-1' },
    });
  });

  it('can move back to received', async () => {
    await expect(moveApplication(world(), recruiter, { applicationId: 'app_2', stageId: 'received' })).resolves.toBeDefined();
  });

  it('refuses unknown stages, the same stage, and decided applications, changing nothing', async () => {
    const d = world();
    const unknown = (await moveApplication(d, recruiter, { applicationId: 'app_1', stageId: 'stage-9' }).catch((e: unknown) => e)) as ValidationError;
    expect(unknown.issues).toEqual([{ path: 'stageId', message: 'unknown_stage' }]);
    await expect(moveApplication(d, recruiter, { applicationId: 'app_1', stageId: 'received' })).rejects.toBeInstanceOf(ValidationError);
    await expect(moveApplication(d, recruiter, { applicationId: 'app_3', stageId: 'received' })).rejects.toBeInstanceOf(ConflictError);
    expect(d.auditLog.events()).toHaveLength(0);
  });

  it('hides applications of other organizations', async () => {
    await expect(moveApplication(world(), userActor({ role: 'owner', organizationId: ORG_B }), { applicationId: 'app_1', stageId: 'stage-0' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each([['owner', true], ['admin', true], ['recruiter', true], ['hiring_manager', true], ['interviewer', false]] as const)(
    'role %s allowed=%s',
    async (role, allowed) => {
      const run = moveApplication(world(), userActor({ role, organizationId: ORG_A }), { applicationId: 'app_1', stageId: 'stage-0' });
      if (allowed) await expect(run).resolves.toBeDefined();
      else await expect(run).rejects.toBeInstanceOf(ForbiddenError);
    },
  );
});

describe('moveApplication: automation queue failure', () => {
  it('keeps the move and reports the failure with ids only, instead of swallowing it', async () => {
    const reported: unknown[] = [];
    const base = world();
    const d = { ...base, queue: createInMemoryTaskQueue(new Error('redis password=hunter2 down')), transaction: createInMemoryTransaction((error) => reported.push(error)) };
    await moveApplication(d, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    expect((await base.applications.findById(ORG_A, 'app_1'))?.stageId).toBe('stage-1');
    expect(reported).toHaveLength(1);
    expect(reported[0]).toBeInstanceOf(AutomationEnqueueError);
    expect((reported[0] as AutomationEnqueueError).context).toEqual({ organizationId: ORG_A, applicationId: 'app_1', stageId: 'stage-1' });
  });
});

describe('decideApplication', () => {
  it('sets outcome and closedAt, audits the outcome, then the application is read-only', async () => {
    const d = world();
    const result = await decideApplication(d, recruiter, { applicationId: 'app_1', outcome: 'not_selected' });
    expect(result.application).toMatchObject({ outcome: 'not_selected', closedAt: d.now(), stageId: 'received' });
    expect(d.auditLog.events()[0]).toMatchObject({ action: 'application.decided', target: { id: 'app_1' }, metadata: { outcome: 'not_selected' } });
    await expect(decideApplication(d, recruiter, { applicationId: 'app_1', outcome: 'hired' })).rejects.toBeInstanceOf(ConflictError);
    await expect(moveApplication(d, recruiter, { applicationId: 'app_1', stageId: 'stage-0' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('validates the outcome and hides other organizations', async () => {
    await expect(decideApplication(world(), recruiter, { applicationId: 'app_1', outcome: 'maybe' })).rejects.toBeInstanceOf(ValidationError);
    await expect(decideApplication(world(), userActor({ role: 'owner', organizationId: ORG_B }), { applicationId: 'app_1', outcome: 'hired' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each([['owner', true], ['admin', true], ['recruiter', true], ['hiring_manager', false], ['interviewer', false]] as const)(
    'role %s allowed=%s',
    async (role, allowed) => {
      const run = decideApplication(world(), userActor({ role, organizationId: ORG_A }), { applicationId: 'app_1', outcome: 'withdrawn' });
      if (allowed) await expect(run).resolves.toBeDefined();
      else await expect(run).rejects.toBeInstanceOf(ForbiddenError);
    },
  );
});

describe('stages removed from the job', () => {
  const removed = () =>
    seedCandidateWorld({
      candidates: [buildCandidate({ organizationId: ORG_A })],
      applications: [
        buildApplication({ organizationId: ORG_A, stageId: 'stage-0' }),
        buildApplication({ id: 'app_2', candidateId: 'cand_1', organizationId: ORG_A, stageId: 'stg-gone', outcome: 'hired', closedAt: new Date() }),
      ],
    });

  it('flags cards whose stage no longer exists and does not crash', async () => {
    const view = await getPipeline(removed(), recruiter, { jobId: 'job_1' });
    expect(view.cards.map((c) => [c.application.id, c.stageRemoved])).toEqual([['app_1', false], ['app_2', true]]);
    expect(view.stages.map((s) => s.count)).toEqual([0, 1, 0]);
  });

  it('flags the decided card returned by decideApplication', async () => {
    const deps = seedCandidateWorld({ applications: [buildApplication({ organizationId: ORG_A, stageId: 'stg-gone' })] });
    const card = await decideApplication(deps, recruiter, { applicationId: 'app_1', outcome: 'not_selected' });
    expect(card.stageRemoved).toBe(true);
  });

  it('moveApplication validates against the current stage ids, not positions', async () => {
    const stages = [
      { id: 'stg-b', type: 'technical_interview', durationMinutes: 60, conductedBy: 'technical_lead' },
      { id: 'stg-a', type: 'hr_interview', durationMinutes: 30, conductedBy: 'recruiter' },
    ] as const;
    const deps = seedCandidateWorld({
      jobs: [buildJob({ id: 'job_1', organizationId: ORG_A, status: 'published', content: completeJobContent({ title: 'x', process: [...stages] }) })],
    });
    await expect(moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' })).rejects.toBeInstanceOf(ValidationError);
    await expect(moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stg-a' })).resolves.toMatchObject({ application: { stageId: 'stg-a' } });
  });
});
