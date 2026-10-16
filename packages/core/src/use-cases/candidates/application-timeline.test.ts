import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../errors.js';
import { ACTORS_OF_JOB_A, leakedMarkers, seedJobScopeWorld } from '../../testing/job-scope-world.js';
import {
  buildApplication,
  buildMessage,
  buildNote,
  createInMemoryUserDirectory,
  ORG_A,
  ORG_B,
  seedHrWorld,
  userActor,
  apiKeyActor,
  type TestHrDeps,
} from '../../testing/index.js';
import { getApplicationTimeline } from './application-timeline.js';

const owner = userActor({ id: 'user_test', role: 'owner', organizationId: ORG_A });
const at = (day: number, hour = 9) => new Date(Date.UTC(2026, 4, day, hour));
const event = (id: string, over: object) => ({
  id, organizationId: ORG_A, applicationId: 'app_1', jobId: 'job_1', fromStageId: null, toStageId: null, outcome: null,
  occurredAt: at(1), actorType: 'user' as const, backfilled: false, ...over,
});

async function world(): Promise<TestHrDeps> {
  const base = seedHrWorld();
  const deps = { ...base, users: createInMemoryUserDirectory({ user_test: 'Olivia Owner' }) } as TestHrDeps;
  await deps.stageEvents.record(event('e0', { toStageId: 'received', occurredAt: at(1), actorType: 'system' }) as never);
  await deps.stageEvents.record(event('e1', { fromStageId: 'received', toStageId: 'stage-0', occurredAt: at(3) }) as never);
  await deps.stageEvents.record(event('e2', { fromStageId: 'stage-0', toStageId: 'stage-1', occurredAt: at(5), backfilled: true }) as never);
  await deps.stageEvents.record(event('e3', { fromStageId: 'stage-1', outcome: 'hired', occurredAt: at(9) }) as never);
  await deps.notes.create(buildNote({ id: 'n1', organizationId: ORG_A, applicationId: 'app_1', authorId: 'user_test', body: 'Good call', createdAt: at(4) }));
  await deps.notes.create(buildNote({ id: 'n2', organizationId: ORG_A, applicationId: 'app_1', authorId: null, authorName: 'Old Recruiter', body: 'Migrated', createdAt: at(2) }));
  await deps.notes.create(buildNote({ id: 'n3', organizationId: ORG_A, applicationId: null, body: 'general', createdAt: at(2) }));
  await deps.messages.create(buildMessage({ id: 'm1', organizationId: ORG_A, status: 'sent', sentAt: at(6), createdAt: at(6), subject: 'Hello' }));
  await deps.messages.create(buildMessage({ id: 'm2', organizationId: ORG_A, direction: 'inbound', status: 'received', sentBy: null, historical: true, createdAt: at(7), subject: 'Re: Hello' }));
  await deps.feedbackRequests.create({
    id: 'fr1', organizationId: ORG_A, applicationId: 'app_1', jobId: 'job_1', stageId: 'stage-1', interviewerKind: 'external', interviewerUserId: null,
    interviewerEmail: 'e@x.example', interviewerName: 'Eva External', tokenHash: 'h', expiresAt: at(20), remindersSent: 0, lastReminderAt: null,
    requestedBy: 'user_test', createdAt: at(5), submittedAt: at(8),
  } as never);
  await deps.interviewFeedback.create({ id: 'f1', organizationId: ORG_A, applicationId: 'app_1', requestId: 'fr1', stageId: 'stage-1', interviewerName: 'Eva External', answers: { tech_open: 'secret' }, recommendation: 'proceed', submittedAt: at(8) });
  return deps;
}

describe('getApplicationTimeline', () => {
  it('lists everything oldest first, with the intake folded into the received entry', async () => {
    const { items } = await getApplicationTimeline(await world(), owner, { applicationId: 'app_1' });
    expect(items.map((i) => i.kind)).toEqual(['received', 'note', 'stage_moved', 'note', 'stage_moved', 'message', 'message', 'feedback_submitted', 'decided']);
    expect(items[0]).toMatchObject({ kind: 'received', stageId: 'received', source: 'careers_page', origin: 'direct', campaign: null });
    expect(items.map((i) => i.at.getTime())).toEqual([...items.map((i) => i.at.getTime())].sort((a, b) => a - b));
  });

  it('marks migrated rows and names authors', async () => {
    const { items } = await getApplicationTimeline(await world(), owner, { applicationId: 'app_1' });
    const moves = items.filter((i) => i.kind === 'stage_moved');
    expect(moves.map((m) => m.fromPreviousSystem)).toEqual([false, true]);
    expect(items.find((i) => i.kind === 'note' && i.id === 'note:n1')?.actor).toEqual({ type: 'person', name: 'Olivia Owner' });
    expect(items.find((i) => i.id === 'note:n2')).toMatchObject({ actor: { type: 'external', name: 'Old Recruiter' }, fromPreviousSystem: true });
    expect(items.find((i) => i.id === 'message:m2')).toMatchObject({ fromPreviousSystem: true, actor: { type: 'candidate', name: null } });
    expect(items.find((i) => i.kind === 'decided')).toMatchObject({ outcome: 'hired' });
  });

  it('leaves out candidate-wide notes and shows no recommendation, answer or score', async () => {
    const { items } = await getApplicationTimeline(await world(), owner, { applicationId: 'app_1' });
    expect(items.some((i) => i.id === 'note:n3')).toBe(false);
    const json = JSON.stringify(items);
    for (const word of ['recommendation', 'proceed', 'secret', 'score', 'rating']) expect(json).not.toContain(word);
  });

  it('shows campaign and reconfirmation events of an imported application', async () => {
    const deps = await world();
    const renewed = buildApplication({
      id: 'app_r', organizationId: ORG_A, candidateId: 'cand_r', jobId: 'job_1', source: 'import', origin: 'import', originCampaign: 'spring',
      importBatchId: 'b1', reconfirmationSentAt: at(2), createdAt: at(1),
      consent: { privacyNoticeId: 'n', privacyNoticeVersion: 1, scopes: ['selection'], givenAt: at(4) },
    });
    await deps.applications.create(renewed);
    const { items } = await getApplicationTimeline(deps, owner, { applicationId: 'app_r' });
    expect(items.map((i) => i.kind)).toEqual(['received', 'reconfirmation_sent', 'reconfirmation_answered']);
    expect(items[0]).toMatchObject({ campaign: 'spring', source: 'import' });
  });

  it('synthesizes the outcome when no decision event exists, and hides an application still to renew', async () => {
    const deps = await world();
    await deps.applications.create(buildApplication({ id: 'app_d', organizationId: ORG_A, jobId: 'job_1', candidateId: 'cand_d', outcome: 'withdrawn', closedAt: at(12) }));
    const { items } = await getApplicationTimeline(deps, owner, { applicationId: 'app_d' });
    expect(items.at(-1)).toMatchObject({ kind: 'decided', outcome: 'withdrawn' });
    await deps.applications.create(buildApplication({ id: 'app_t', organizationId: ORG_A, jobId: 'job_1', consentStatus: 'to_renew', candidateId: 'cand_t' }));
    await expect(getApplicationTimeline(deps, owner, { applicationId: 'app_t' })).rejects.toBeInstanceOf(NotFoundError);
    expect((await getApplicationTimeline(deps, owner, { applicationId: 'app_t', viaJobId: 'job_1' })).items[0]?.kind).toBe('received');
  });

  it('does not exist for another organization or an unknown id', async () => {
    const deps = await world();
    await expect(getApplicationTimeline(deps, userActor({ role: 'owner', organizationId: ORG_B }), { applicationId: 'app_1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getApplicationTimeline(deps, owner, { applicationId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('omits the sections the actor may not read', async () => {
    const deps = await world();
    const key = apiKeyActor({ organizationId: ORG_A, role: 'owner', scopes: ['candidate:read'] });
    const kinds = (await getApplicationTimeline(deps, key, { applicationId: 'app_1' })).items.map((i) => i.kind);
    expect(kinds).not.toContain('message');
    expect(kinds).not.toContain('feedback_submitted');
    expect(kinds).toContain('note');
    await expect(getApplicationTimeline(deps, apiKeyActor({ organizationId: ORG_A, scopes: ['job:read'] }), { applicationId: 'app_1' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('getApplicationTimeline: access by ad', () => {
  it('shows a job-A team member the timeline of job A and nothing of job B', async () => {
    const deps = await seedJobScopeWorld();
    for (const actor of Object.values(ACTORS_OF_JOB_A)) {
      const own = await getApplicationTimeline(deps, actor, { applicationId: 'app_a' });
      expect(own.items.map((i) => i.kind)).toContain('message');
      expect(leakedMarkers(own)).toEqual([]);
      await expect(getApplicationTimeline(deps, actor, { applicationId: 'app_b' })).rejects.toBeInstanceOf(NotFoundError);
      await expect(getApplicationTimeline(deps, actor, { applicationId: 'app_s2' })).rejects.toBeInstanceOf(NotFoundError);
      expect(leakedMarkers(await getApplicationTimeline(deps, actor, { applicationId: 'app_s1' }))).toEqual([]);
    }
  });

  it('lets the owner reach job B', async () => {
    const deps = await seedJobScopeWorld();
    const { items } = await getApplicationTimeline(deps, owner, { applicationId: 'app_b' });
    expect(items.map((i) => i.kind)).toEqual(expect.arrayContaining(['received', 'note', 'message', 'feedback_submitted']));
  });
});
