import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors.js';
import {
  buildApplication,
  buildCandidate,
  buildJob,
  buildMessage,
  createFakeEmailSender,
  createInMemoryTaskQueue,
  type MessagingSeedOptions,
  completeJobContent,
  fakePdfBytes,
  seedMessagingWorld,
  systemActor,
  userActor,
  validApplicationForm,
  ORG_A,
  ORG_B,
} from '../../testing/index.js';
import { buildPrivacyNotice } from '../../testing/candidate-fixtures.js';
import { createInMemoryJobRepository } from '../../testing/in-memory-jobs.js';
import { createInMemoryPrivacyNoticeRepository } from '../../testing/in-memory-privacy.js';
import { deliverMessage } from '../messaging/deliver-message.js';
import { decideApplication } from './decide-application.js';
import { decideApplications } from './decide-applications.js';
import { moveApplication } from './move-application.js';
import { submitApplication } from './submit-application.js';

const recruiter = userActor({ role: 'recruiter', organizationId: ORG_A });
const NOW = new Date('2026-06-01T10:00:00.000Z');
const DAY = 86_400_000;
const worker = systemActor({ organizationId: ORG_A });

const world = (applicationOverrides = {}, options: MessagingSeedOptions = {}) =>
  seedMessagingWorld({
    ...options,
    applications: [buildApplication({ organizationId: ORG_A, stageChangedAt: new Date('2026-05-25T10:00:00Z'), responseDueAt: new Date('2026-05-30T10:00:00Z'), ...applicationOverrides })],
  });
const application = (deps: ReturnType<typeof world>) => deps.store.read().applications[0];

describe('response clock: intake', () => {
  it('sets the deadline to now + the job responseDays and records application.received without personal data', async () => {
    const deps = seedMessagingWorld({ applications: [], candidates: [] });
    await submitApplication(deps, {
      organizationSlug: 'acme',
      jobSlug: 'backend',
      form: validApplicationForm(),
      cv: { bytes: fakePdfBytes(), declaredName: 'cv.pdf' },
    });
    const stored = application(deps);
    expect(stored).toMatchObject({ respondedAt: null, responseDueAt: new Date(NOW.getTime() + 5 * DAY) });
    const events = deps.outbox.snapshot();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ organizationId: ORG_A, type: 'application.received', data: { applicationId: stored?.id, jobId: 'job_1' }, publishedAt: null });
    expect(JSON.stringify(events)).not.toMatch(/ada|lovelace|example\.com/i);
    expect(deps.queue.jobs().at(-1)).toEqual({ name: 'automation.run', payload: { organizationId: ORG_A, applicationId: stored?.id, stageId: 'received' } });
  });

  it('leaves the deadline empty when the job declares no response time', async () => {
    const content = { ...completeJobContent(), responseDays: undefined };
    const deps = seedMessagingWorld({
      applications: [],
      candidates: [],
      overrides: {
        jobs: createInMemoryJobRepository([buildJob({ id: 'job_1', slug: 'backend', organizationId: ORG_A, status: 'published', content })]),
        privacyNotices: createInMemoryPrivacyNoticeRepository([buildPrivacyNotice({ organizationId: ORG_A })]),
      },
    });
    await submitApplication(deps, { organizationSlug: 'acme', jobSlug: 'backend', form: validApplicationForm(), cv: { bytes: fakePdfBytes(), declaredName: 'cv.pdf' } });
    expect(application(deps)?.responseDueAt).toBeNull();
  });
});

describe('response clock: move', () => {
  it('restarts the clock: new deadline from now, answered reset, automation queued, event without personal data', async () => {
    const deps = world({ respondedAt: new Date('2026-05-26T00:00:00Z') });
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' });
    expect(application(deps)).toMatchObject({
      stageId: 'stage-0',
      stageChangedAt: NOW,
      responseDueAt: new Date(NOW.getTime() + 5 * DAY),
      respondedAt: null,
    });
    expect(deps.outbox.snapshot()[0]).toMatchObject({ type: 'application.moved', data: { applicationId: 'app_1', jobId: 'job_1', from: 'received', to: 'stage-0' } });
    expect(deps.queue.jobs()).toEqual([{ name: 'automation.run', payload: { organizationId: ORG_A, applicationId: 'app_1', stageId: 'stage-0' } }]);
  });

  it('still moves when the automation task cannot be queued', async () => {
    const deps = world({}, { overrides: { queue: createInMemoryTaskQueue(new Error('queue down')) } });
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' });
    expect(application(deps)?.stageId).toBe('stage-0');
  });

  it('writes nothing for a refused move', async () => {
    const deps = world({ outcome: 'hired', closedAt: NOW });
    await expect(moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' })).rejects.toBeInstanceOf(ConflictError);
    expect(deps.outbox.snapshot()).toHaveLength(0);
    expect(deps.queue.jobs()).toHaveLength(0);
  });
});

describe('response clock: decide', () => {
  it('closes the promise: no deadline, answered now, application.decided event', async () => {
    const deps = world();
    const card = await decideApplication(deps, recruiter, { applicationId: 'app_1', outcome: 'not_selected' });
    expect(application(deps)).toMatchObject({ outcome: 'not_selected', responseDueAt: null, respondedAt: NOW });
    expect(card.responseState).toBe('closed');
    expect(deps.outbox.snapshot()[0]).toMatchObject({ type: 'application.decided', data: { applicationId: 'app_1', jobId: 'job_1', outcome: 'not_selected' } });
  });
});

describe('decideApplications (bulk)', () => {
  const many = () =>
    seedMessagingWorld({
      candidates: [buildCandidate({ organizationId: ORG_A }), buildCandidate({ id: 'cand_2', organizationId: ORG_A, email: 'b@x.it' })],
      applications: [
        buildApplication({ organizationId: ORG_A }),
        buildApplication({ id: 'app_2', candidateId: 'cand_2', organizationId: ORG_A }),
        buildApplication({ id: 'app_3', candidateId: 'cand_2', organizationId: ORG_A, outcome: 'hired', closedAt: NOW }),
      ],
    });

  it('decides every application, with one audit event and one outbox event each', async () => {
    const deps = many();
    expect(await decideApplications(deps, recruiter, { applicationIds: ['app_1', 'app_2', 'app_1'], outcome: 'not_selected' })).toEqual({ decided: 2 });
    expect(deps.store.read().applications.map((a) => a.outcome)).toEqual(['not_selected', 'not_selected', 'hired']);
    expect(deps.auditLog.events().map((e) => [e.action, e.target.id])).toEqual([
      ['application.decided', 'app_1'],
      ['application.decided', 'app_2'],
    ]);
    expect(deps.outbox.snapshot().map((e) => e.type)).toEqual(['application.decided', 'application.decided']);
  });

  it('refuses the whole batch when one is already decided or missing, writing nothing', async () => {
    const deps = many();
    await expect(decideApplications(deps, recruiter, { applicationIds: ['app_1', 'app_3'], outcome: 'not_selected' })).rejects.toBeInstanceOf(ConflictError);
    await expect(decideApplications(deps, recruiter, { applicationIds: ['app_1', 'nope'], outcome: 'not_selected' })).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.store.read().applications.map((a) => a.outcome)).toEqual([null, null, 'hired']);
    expect(deps.auditLog.events()).toHaveLength(0);
  });

  it('needs candidate:decide and never reaches into another organization', async () => {
    await expect(decideApplications(many(), userActor({ role: 'hiring_manager', organizationId: ORG_A }), { applicationIds: ['app_1'], outcome: 'hired' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(decideApplications(many(), userActor({ role: 'owner', organizationId: ORG_B }), { applicationIds: ['app_1'], outcome: 'hired' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('response clock: outbound messages', () => {
  const sendable = (overrides = {}) => {
    const deps = world(overrides);
    deps.messagingStore.write({ messages: [buildMessage({ organizationId: ORG_A, createdAt: new Date('2026-05-28T10:00:00Z') })] });
    return deps;
  };
  const send = (deps: ReturnType<typeof world>, messageId = 'msg_1') => deliverMessage(deps, worker, { organizationId: ORG_A, messageId });

  it('a person-sent message marks the application answered and clears the deadline', async () => {
    const deps = sendable();
    expect(await send(deps)).toBe('sent');
    expect(application(deps)).toMatchObject({ respondedAt: NOW, responseDueAt: null });
  });

  it('the automatic receipt does not', async () => {
    const deps = sendable();
    deps.messagingStore.write({ messages: [buildMessage({ organizationId: ORG_A, sentBy: 'system', createdAt: new Date('2026-05-28T10:00:00Z') })] });
    await send(deps);
    expect(application(deps)).toMatchObject({ respondedAt: null, responseDueAt: new Date('2026-05-30T10:00:00Z') });
  });

  it('a failed message does not', async () => {
    const failing = world({}, { messagingOverrides: { sender: createFakeEmailSender(Object.assign(new Error('x'), { permanent: true })) } });
    failing.messagingStore.write({ messages: [buildMessage({ organizationId: ORG_A, createdAt: new Date('2026-05-28T10:00:00Z') })] });
    expect(await send(failing)).toBe('failed');
    expect(failing.store.read().applications[0]?.respondedAt).toBeNull();
  });

  it('a message written before the last stage change does not answer the new stage', async () => {
    const deps = sendable({ stageChangedAt: new Date('2026-05-30T10:00:00Z') });
    await send(deps);
    expect(application(deps)?.respondedAt).toBeNull();
  });

  it('does not touch a decided application', async () => {
    const deps = sendable({ outcome: 'not_selected', closedAt: NOW });
    await send(deps);
    expect(application(deps)?.respondedAt).toBeNull();
  });

  it('keeps the first answer of the stage', async () => {
    const deps = sendable({ respondedAt: new Date('2026-05-27T00:00:00Z'), responseDueAt: null });
    await send(deps);
    expect(application(deps)?.respondedAt).toEqual(new Date('2026-05-27T00:00:00Z'));
  });
});
