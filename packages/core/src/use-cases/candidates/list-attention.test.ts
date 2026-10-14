import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../errors.js';
import { buildApplication, buildCandidate, buildJob, seedAutomationWorld, userActor, ORG_A, ORG_B } from '../../testing/index.js';
import { listAttention } from './list-attention.js';

const HOUR = 3_600_000;
const NOW = new Date('2026-06-01T10:00:00.000Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const viewer = userActor({ role: 'interviewer', organizationId: ORG_A });

const world = () =>
  seedAutomationWorld({
    candidates: ['1', '2', '3', '4', '5'].map((n) => buildCandidate({ id: `cand_${n}`, organizationId: ORG_A, email: `c${n}@x.it`, firstName: `C${n}` })),
    applications: [
      buildApplication({ id: 'overdue', candidateId: 'cand_1', organizationId: ORG_A, responseDueAt: at(-30) }),
      buildApplication({ id: 'soon', candidateId: 'cand_2', organizationId: ORG_A, stageId: 'stage-0', responseDueAt: at(20) }),
      buildApplication({ id: 'later', candidateId: 'cand_3', organizationId: ORG_A, responseDueAt: at(100) }),
      buildApplication({ id: 'answered', candidateId: 'cand_4', organizationId: ORG_A, responseDueAt: null, respondedAt: at(-1) }),
      buildApplication({ id: 'decided', candidateId: 'cand_5', organizationId: ORG_A, outcome: 'hired', closedAt: NOW, responseDueAt: at(-30) }),
    ],
  });

describe('listAttention', () => {
  it('lists open applications due within 48h or overdue, most urgent first, with names and stage label', async () => {
    const page = await listAttention(world(), viewer, {});
    expect(page.items.map((i) => [i.application.id, i.state])).toEqual([
      ['overdue', 'overdue'],
      ['soon', 'due_soon'],
    ]);
    expect(page.total).toBe(2);
    expect(page.items[0]).toMatchObject({ candidate: { firstName: 'C1' }, job: { id: 'job_1' }, ownerName: 'Olivia Owner', stageLabel: 'Candidatura ricevuta' });
    expect(page.items[1]?.stageLabel).toBe('Colloquio HR');
  });

  it('filters by state and paginates', async () => {
    expect((await listAttention(world(), viewer, { state: 'due_soon' })).items.map((i) => i.application.id)).toEqual(['soon']);
    const second = await listAttention(world(), viewer, { page: 2, limit: 1 });
    expect(second.items.map((i) => i.application.id)).toEqual(['soon']);
    expect(second.total).toBe(2);
  });

  it('skips applications whose job is gone, and falls back to "Former member" for a removed owner', async () => {
    const deps = world();
    deps.store.write({ applications: [...deps.store.read().applications, buildApplication({ id: 'orphan', candidateId: 'cand_1', jobId: 'missing', organizationId: ORG_A, responseDueAt: at(-5) })] });
    expect((await listAttention(deps, viewer, {})).total).toBe(2);
    const noOwner = seedAutomationWorld({
      jobs: [buildJob({ id: 'job_1', organizationId: ORG_A, status: 'published', createdBy: 'ghost' })],
      applications: [buildApplication({ organizationId: ORG_A, responseDueAt: at(-5) })],
    });
    expect((await listAttention(noOwner, viewer, {})).total).toBe(0);
    await noOwner.jobTeams.upsert({ organizationId: ORG_A, jobId: 'job_1', userId: viewer.id, role: 'interviewer', addedBy: 'system', createdAt: new Date() });
    expect((await listAttention(noOwner, viewer, {})).items[0]?.ownerName).toBe('Former member');
  });

  it('is isolated per organization and validates input', async () => {
    expect((await listAttention(world(), userActor({ role: 'owner', organizationId: ORG_B }), {})).items).toEqual([]);
    await expect(listAttention(world(), viewer, { state: 'closed' })).rejects.toBeInstanceOf(ValidationError);
    await expect(listAttention(world(), userActor({ organizationId: 'other' }), {})).resolves.toMatchObject({ total: 0 });
  });

  it('is audit-free', async () => {
    const deps = world();
    await listAttention(deps, viewer, {});
    expect(deps.auditLog.events()).toHaveLength(0);
  });
});
