import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import {
  agentActor,
  apiKeyActor,
  createInMemoryTaskQueue,
  CV_KEY_1,
  CV_KEY_2,
  CV_KEY_3,
  ERASED,
  KEPT,
  ORG_A,
  ORG_B,
  seedPrivacyData,
  userActor,
} from '../../testing/index.js';
import { eraseCandidateData, FileCleanupError } from './erase-candidate-data.js';
import { eraseApplication, eraseCandidate } from './erase-candidate.js';

const recruiter = userActor({ id: 'user_r', role: 'recruiter', organizationId: ORG_A });
const fullName = `${ERASED.firstName} ${ERASED.lastName}`;
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('eraseCandidate', () => {
  it('deletes the candidate and everything hanging from the applications, and keeps the bystander', async () => {
    const deps = await seedPrivacyData();
    const result = await eraseCandidate(deps, recruiter, { candidateId: 'cand_1', confirmName: `  ${fullName.toUpperCase()} ` });
    expect(result).toEqual({ erased: true, applicationCount: 2, candidateErased: true });
    const { candidates, applications, notes, extractions } = deps.store.read();
    expect(candidates.map((c) => c.id)).toEqual(['cand_2']);
    expect(applications.map((a) => a.id)).toEqual(['app_3']);
    expect(notes.map((n) => n.id)).toEqual(['note_3']);
    expect(extractions.map((e) => e.applicationId)).toEqual(['app_3']);
    const { messages, conversations } = deps.messagingStore.read();
    expect(messages.every((m) => m.applicationId === 'app_3')).toBe(true);
    expect(conversations.map((c) => c.applicationId)).toEqual(['app_3']);
    expect(deps.tasks.snapshot().map((t) => t.applicationId)).toEqual(['app_3']);
    expect(deps.notifications.snapshot().map((n) => n.applicationId)).toEqual(['app_3']);
    expect(deps.deliveries.snapshot().map((d) => d.eventId)).toEqual(['evt_app_3']);
    expect(deps.files.keys()).toEqual([CV_KEY_3]);
  });

  it('removes the stage events and response promises of the erased applications and keeps the others', async () => {
    const deps = await seedPrivacyData();
    const event = (applicationId: string) => ({ id: `ev_${applicationId}`, organizationId: ORG_A, applicationId, jobId: 'job_1', fromStageId: null, toStageId: 'received', outcome: null, occurredAt: new Date(), actorType: 'system' as const, backfilled: false });
    const promise = (applicationId: string) => ({ id: `p_${applicationId}`, organizationId: ORG_A, applicationId, jobId: 'job_1', stageId: 'received', startedAt: new Date(), dueAt: new Date(), respondedAt: null, status: 'open' as const, backfilled: false });
    deps.store.write({ stageEvents: ['app_1', 'app_2', 'app_3'].map(event), promises: ['app_1', 'app_2', 'app_3'].map(promise) });
    await eraseCandidate(deps, recruiter, { candidateId: 'cand_1', confirmName: fullName });
    expect(deps.store.read().stageEvents.map((e) => e.applicationId)).toEqual(['app_3']);
    expect(deps.store.read().promises.map((p) => p.applicationId)).toEqual(['app_3']);
  });

  it('leaves an audit event with ids and counts only, and the webhook event with ids only', async () => {
    const deps = await seedPrivacyData();
    await eraseCandidate(deps, recruiter, { candidateId: 'cand_1', confirmName: fullName });
    const events = deps.auditLog.events().filter((e) => e.action === 'candidate.erased');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      organizationId: ORG_A,
      actor: { type: 'user', id: 'user_r' },
      target: { type: 'candidate', id: 'cand_1' },
      metadata: { reason: 'request', applicationCount: 2 },
    });
    const erasedEvents = deps.outbox.snapshot().filter((e) => e.type === 'candidate.erased');
    expect(erasedEvents).toHaveLength(1);
    expect(erasedEvents[0]?.data).toEqual({ candidateId: 'cand_1', applicationCount: 2, candidateErased: true });
    expect(JSON.stringify([events, erasedEvents])).not.toContain(ERASED.email);
  });

  it('refuses a wrong confirmation and deletes nothing', async () => {
    const deps = await seedPrivacyData();
    const error = await rejection(eraseCandidate(deps, recruiter, { candidateId: 'cand_1', confirmName: 'Zelda' }));
    expect(error).toBeInstanceOf(ValidationError);
    expect(deps.store.read().candidates).toHaveLength(2);
    expect(deps.auditLog.events().filter((e) => e.action === 'candidate.erased')).toHaveLength(0);
  });

  it('answers not found for a candidate of another organization and deletes nothing', async () => {
    const deps = await seedPrivacyData();
    const otherOrg = userActor({ role: 'owner', organizationId: ORG_B });
    expect(await rejection(eraseCandidate(deps, otherOrg, { candidateId: 'cand_1', confirmName: fullName }))).toBeInstanceOf(NotFoundError);
    expect(deps.store.read().candidates).toHaveLength(2);
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['recruiter', true],
    ['hiring_manager', false],
    ['interviewer', false],
  ] as const)('role %s may erase: %s', async (role, allowed) => {
    const deps = await seedPrivacyData();
    const run = eraseCandidate(deps, userActor({ role, organizationId: ORG_A }), { candidateId: 'cand_1', confirmName: fullName });
    if (allowed) await expect(run).resolves.toMatchObject({ erased: true });
    else expect(await rejection(run)).toBeInstanceOf(ForbiddenError);
  });

  it('refuses an actor of another organization acting on this one', async () => {
    const deps = await seedPrivacyData();
    const error = await rejection(eraseCandidate(deps, userActor({ organizationId: ORG_B }), { candidateId: 'cand_1', confirmName: fullName }));
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('is refused to an agent and to an API key, whatever the role behind them', async () => {
    const deps = await seedPrivacyData();
    const input = { candidateId: 'cand_1', confirmName: fullName };
    const agent = agentActor({ role: 'recruiter', organizationId: ORG_A, onBehalfOfUserId: 'user_r' });
    const key = apiKeyActor({ role: 'owner', organizationId: ORG_A, onBehalfOfUserId: 'user_r' });
    expect(await rejection(eraseCandidate(deps, agent, input))).toBeInstanceOf(ForbiddenError);
    expect(await rejection(eraseCandidate(deps, key, input))).toBeInstanceOf(ForbiddenError);
    expect(deps.auditLog.events().some((e) => e.action === 'candidate.erased')).toBe(false);
  });
});

describe('eraseApplication', () => {
  it('erases one application and keeps the candidate while another remains', async () => {
    const deps = await seedPrivacyData();
    const result = await eraseApplication(deps, recruiter, { applicationId: 'app_1', confirmName: fullName });
    expect(result).toEqual({ erased: true, applicationCount: 1, candidateErased: false });
    expect(deps.store.read().applications.map((a) => a.id)).toEqual(['app_2', 'app_3']);
    expect(deps.store.read().candidates.map((c) => c.id)).toEqual(['cand_1', 'cand_2']);
    expect(deps.store.read().notes.map((n) => n.id)).toEqual(['note_2', 'note_3']);
    expect(deps.files.keys()).toEqual([CV_KEY_2, CV_KEY_3]);
    expect(deps.outbox.snapshot().some((e) => e.data.applicationId === 'app_1')).toBe(false);
  });

  it('erases the candidate too when it was the last application', async () => {
    const deps = await seedPrivacyData();
    await eraseApplication(deps, recruiter, { applicationId: 'app_1', confirmName: fullName });
    const result = await eraseApplication(deps, recruiter, { applicationId: 'app_2', confirmName: fullName });
    expect(result.candidateErased).toBe(true);
    expect(deps.store.read().candidates.map((c) => c.id)).toEqual(['cand_2']);
    expect(deps.store.read().notes.map((n) => n.id)).toEqual(['note_3']);
  });

  it('refuses a wrong name, a foreign application and a role without erase', async () => {
    const deps = await seedPrivacyData();
    expect(await rejection(eraseApplication(deps, recruiter, { applicationId: 'app_1', confirmName: 'Someone Else' }))).toBeInstanceOf(ValidationError);
    expect(await rejection(eraseApplication(deps, userActor({ organizationId: ORG_B }), { applicationId: 'app_1', confirmName: fullName }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(eraseApplication(deps, userActor({ role: 'hiring_manager', organizationId: ORG_A }), { applicationId: 'app_1', confirmName: fullName }))).toBeInstanceOf(ForbiddenError);
    expect(deps.store.read().applications).toHaveLength(3);
  });
});

describe('eraseCandidateData files', () => {
  const failingDelete = (storage: Awaited<ReturnType<typeof seedPrivacyData>>['files']) => ({ ...storage, delete: async () => Promise.reject(new Error('s3 down')) });

  it('queues a files.delete task for every key whose deletion failed, and the rows are gone anyway', async () => {
    const seeded = await seedPrivacyData();
    const deps = { ...seeded, files: failingDelete(seeded.files) };
    await eraseCandidateData(deps, { organizationId: ORG_A, candidateId: 'cand_1', reason: 'retention', actor: { type: 'system', id: null, onBehalfOfUserId: null } });
    expect(seeded.store.read().applications.map((a) => a.id)).toEqual(['app_3']);
    expect(seeded.queue.jobs()).toEqual([
      { name: 'files.delete', payload: { organizationId: ORG_A, key: CV_KEY_1 } },
      { name: 'files.delete', payload: { organizationId: ORG_A, key: CV_KEY_2 } },
    ]);
  });

  it('reports the keys that could be neither deleted nor queued', async () => {
    const seeded = await seedPrivacyData();
    const deps = { ...seeded, files: failingDelete(seeded.files), queue: createInMemoryTaskQueue(new Error('queue down')) };
    const error = await rejection(eraseCandidateData(deps, { organizationId: ORG_A, candidateId: 'cand_1', reason: 'request', actor: { type: 'system', id: null, onBehalfOfUserId: null } }));
    expect(error).toBeInstanceOf(FileCleanupError);
    expect((error as FileCleanupError).keys).toEqual([CV_KEY_1, CV_KEY_2]);
    expect(seeded.store.read().candidates.map((c) => c.id)).toEqual(['cand_2']);
  });

  it('rolls everything back when the audit event cannot be written inside the transaction', async () => {
    const seeded = await seedPrivacyData();
    const deps = { ...seeded, erasure: { run: <T,>(work: Parameters<typeof seeded.erasure.run<T>>[0]) => seeded.erasure.run((r) => work({ ...r, auditLog: { ...r.auditLog, append: async () => Promise.reject(new Error('audit down')) } })) } };
    await expect(eraseCandidateData(deps, { organizationId: ORG_A, candidateId: 'cand_1', reason: 'request', actor: { type: 'system', id: null, onBehalfOfUserId: null } })).rejects.toThrow('audit down');
    expect(seeded.store.read().candidates.map((c) => c.id)).toEqual(['cand_1', 'cand_2']);
    expect(seeded.files.keys()).toHaveLength(3);
  });

  it('leaves the bystander data and nothing of the erased person in the store', async () => {
    const deps = await seedPrivacyData();
    await eraseCandidate(deps, recruiter, { candidateId: 'cand_1', confirmName: fullName });
    expect(JSON.stringify(deps.store.read().candidates)).toContain(KEPT.email);
    expect(JSON.stringify(deps.store.read())).not.toContain(ERASED.email);
  });
});
