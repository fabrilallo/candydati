import type { ResponsePromise } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import {
  buildApplication,
  buildJob,
  buildMessage,
  completeJobContent,
  fakePdfBytes,
  seedAutomationWorld,
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
import { decideApplication } from '../candidates/decide-application.js';
import { decideApplications } from '../candidates/decide-applications.js';
import { moveApplication } from '../candidates/move-application.js';
import { submitApplication } from '../candidates/submit-application.js';
import { scanDeadlines } from '../automations/scan-deadlines.js';
import { deliverMessage } from '../messaging/deliver-message.js';

const NOW = new Date('2026-06-01T10:00:00.000Z');
const DAY = 86_400_000;
const recruiter = userActor({ role: 'recruiter', organizationId: ORG_A });
const worker = systemActor({ organizationId: ORG_A });

const promise = (overrides: Partial<ResponsePromise> = {}): ResponsePromise => ({
  id: 'p_old',
  organizationId: ORG_A,
  applicationId: 'app_1',
  jobId: 'job_1',
  stageId: 'received',
  startedAt: new Date('2026-05-25T10:00:00Z'),
  dueAt: new Date('2026-06-05T10:00:00Z'),
  respondedAt: null,
  status: 'open',
  backfilled: false,
  ...overrides,
});

/** An application in `received` since 2026-05-25 with a promise; `dueAt` decides whether the answer at NOW is on time. */
function world(dueAt: string, applicationOverrides = {}) {
  const deps = seedAutomationWorld({
    applications: [buildApplication({ organizationId: ORG_A, stageChangedAt: new Date('2026-05-25T10:00:00Z'), responseDueAt: new Date(dueAt), ...applicationOverrides })],
  });
  deps.store.write({ promises: [promise({ dueAt: new Date(dueAt) })] });
  return deps;
}
const promises = (deps: ReturnType<typeof world>) => deps.store.read().promises;
const events = (deps: ReturnType<typeof world>) => deps.store.read().stageEvents;

describe('tracking: intake', () => {
  const submit = (deps: ReturnType<typeof seedMessagingWorld>, extra = {}) =>
    submitApplication(deps, { organizationSlug: 'acme', jobSlug: 'backend', form: validApplicationForm(), cv: { bytes: fakePdfBytes(), declaredName: 'cv.pdf' }, ...extra });

  it('records the received event and opens the promise with the deadline computed once for the application', async () => {
    const deps = seedMessagingWorld({ applications: [], candidates: [] });
    await submit(deps);
    const stored = deps.store.read().applications[0];
    expect(deps.store.read().stageEvents).toEqual([
      expect.objectContaining({ applicationId: stored?.id, jobId: 'job_1', fromStageId: null, toStageId: 'received', outcome: null, occurredAt: NOW, actorType: 'system', backfilled: false }),
    ]);
    expect(deps.store.read().promises).toEqual([
      expect.objectContaining({ applicationId: stored?.id, stageId: 'received', startedAt: NOW, dueAt: stored?.responseDueAt, respondedAt: null, status: 'open', backfilled: false }),
    ]);
    expect(stored?.responseDueAt).toEqual(new Date(NOW.getTime() + 5 * DAY));
  });

  it('opens no promise when the job declares no response time, but still records the event', async () => {
    const content = { ...completeJobContent(), responseDays: undefined };
    const deps = seedMessagingWorld({
      applications: [],
      candidates: [],
      overrides: {
        jobs: createInMemoryJobRepository([buildJob({ id: 'job_1', slug: 'backend', organizationId: ORG_A, status: 'published', content })]),
        privacyNotices: createInMemoryPrivacyNoticeRepository([buildPrivacyNotice({ organizationId: ORG_A })]),
      },
    });
    await submit(deps);
    expect(deps.store.read().promises).toEqual([]);
    expect(deps.store.read().stageEvents).toHaveLength(1);
  });

  it('stores the sanitized origin, never a URL, and direct when absent', async () => {
    const withOrigin = seedMessagingWorld({ applications: [], candidates: [] });
    await submit(withOrigin, { origin: 'https://www.LinkedIn.com/jobs/view/1?trk=abc' });
    expect(withOrigin.store.read().applications[0]?.origin).toBe('linkedin.com');
    const without = seedMessagingWorld({ applications: [], candidates: [] });
    await submit(without);
    expect(without.store.read().applications[0]?.origin).toBe('direct');
    const personal = seedMessagingWorld({ applications: [], candidates: [] });
    await submit(personal, { origin: 'mario.rossi@example.org' });
    expect(personal.store.read().applications[0]?.origin).toBe('direct');
  });

  it('stores the sanitized campaign, and none when absent or personal data', async () => {
    const withCampaign = seedMessagingWorld({ applications: [], candidates: [] });
    await submit(withCampaign, { origin: 'linkedin', campaign: 'Autumn 2026 <b>' });
    expect(withCampaign.store.read().applications[0]?.originCampaign).toBe('autumn-2026-b');
    const without = seedMessagingWorld({ applications: [], candidates: [] });
    await submit(without, { origin: 'linkedin' });
    expect(without.store.read().applications[0]?.originCampaign).toBeNull();
    const personal = seedMessagingWorld({ applications: [], candidates: [] });
    await submit(personal, { campaign: 'mario.rossi@example.org' });
    expect(personal.store.read().applications[0]?.originCampaign).toBeNull();
  });

  it('leaves no event or promise behind for a duplicate application', async () => {
    const deps = seedMessagingWorld({ applications: [], candidates: [] });
    await submit(deps);
    await submit(deps); // a duplicate is answered like a success and stores nothing
    expect(deps.store.read().stageEvents).toHaveLength(1);
    expect(deps.store.read().promises).toHaveLength(1);
  });
});

describe('tracking: move', () => {
  it('answers the previous promise kept when on time, opens the next one and records the entry', async () => {
    const deps = world('2026-06-05T10:00:00Z');
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' });
    expect(promises(deps)).toEqual([
      expect.objectContaining({ id: 'p_old', status: 'kept', respondedAt: NOW }),
      expect.objectContaining({ stageId: 'stage-0', startedAt: NOW, dueAt: new Date(NOW.getTime() + 5 * DAY), respondedAt: null, status: 'open' }),
    ]);
    expect(events(deps)).toEqual([expect.objectContaining({ fromStageId: 'received', toStageId: 'stage-0', occurredAt: NOW, actorType: 'user', outcome: null })]);
  });

  it('answers it missed when the move comes after the deadline', async () => {
    const deps = world('2026-05-30T10:00:00Z');
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    expect(promises(deps)[0]).toMatchObject({ status: 'missed', respondedAt: NOW });
  });

  it('counts a deadline met exactly as kept', async () => {
    const deps = world(NOW.toISOString());
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' });
    expect(promises(deps)[0]?.status).toBe('kept');
  });

  it('writes nothing for a refused move', async () => {
    const deps = world('2026-06-05T10:00:00Z', { outcome: 'hired', closedAt: NOW });
    await expect(moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' })).rejects.toThrow();
    expect(events(deps)).toEqual([]);
    expect(promises(deps)[0]?.status).toBe('open');
  });
});

describe('tracking: decide', () => {
  it('closes the promise and records the outcome with the actor', async () => {
    const deps = world('2026-06-05T10:00:00Z');
    await decideApplication(deps, recruiter, { applicationId: 'app_1', outcome: 'hired' });
    expect(promises(deps)).toEqual([expect.objectContaining({ status: 'kept', respondedAt: NOW })]);
    expect(events(deps)).toEqual([expect.objectContaining({ fromStageId: 'received', toStageId: null, outcome: 'hired', occurredAt: NOW, actorType: 'user' })]);
  });

  it('a late decision is a missed promise', async () => {
    const deps = world('2026-05-30T10:00:00Z');
    await decideApplication(deps, recruiter, { applicationId: 'app_1', outcome: 'not_selected' });
    expect(promises(deps)[0]).toMatchObject({ status: 'missed', respondedAt: NOW });
  });

  it('the bulk decision records one event per application', async () => {
    const deps = world('2026-06-05T10:00:00Z');
    await decideApplications(deps, recruiter, { applicationIds: ['app_1'], outcome: 'not_selected' });
    expect(events(deps).map((e) => e.outcome)).toEqual(['not_selected']);
    expect(promises(deps)[0]?.status).toBe('kept');
  });
});

describe('tracking: person-sent messages', () => {
  const sendable = (dueAt: string, message = {}) => {
    const deps = world(dueAt);
    deps.messagingStore.write({ messages: [buildMessage({ organizationId: ORG_A, createdAt: new Date('2026-05-28T10:00:00Z'), ...message })] });
    return deps;
  };
  const send = (deps: ReturnType<typeof world>) => deliverMessage(deps, worker, { organizationId: ORG_A, messageId: 'msg_1' });

  it('answers the promise on time', async () => {
    const deps = sendable('2026-06-05T10:00:00Z');
    await send(deps);
    expect(promises(deps)[0]).toMatchObject({ status: 'kept', respondedAt: NOW });
  });

  it('answers it late as missed', async () => {
    const deps = sendable('2026-05-30T10:00:00Z');
    await send(deps);
    expect(promises(deps)[0]).toMatchObject({ status: 'missed', respondedAt: NOW });
  });

  it('is not answered by the automatic receipt', async () => {
    const deps = sendable('2026-06-05T10:00:00Z', { sentBy: 'system' });
    await send(deps);
    expect(promises(deps)[0]).toMatchObject({ status: 'open', respondedAt: null });
  });

  it('is not answered by a message written before the stage began', async () => {
    const deps = sendable('2026-06-05T10:00:00Z', { createdAt: new Date('2026-05-20T10:00:00Z') });
    await send(deps);
    expect(promises(deps)[0]?.respondedAt).toBeNull();
  });
});

describe('tracking: hourly scan', () => {
  it('flips open promises past due to missed, once, leaving them unanswered', async () => {
    const deps = world('2026-05-30T10:00:00Z');
    deps.store.write({ promises: [...promises(deps), promise({ id: 'p_future', applicationId: 'app_2', dueAt: new Date('2026-06-03T10:00:00Z') })] });
    expect(await scanDeadlines(deps, { now: NOW })).toMatchObject({ missedPromises: 1 });
    expect(promises(deps).map((p) => [p.id, p.status, p.respondedAt])).toEqual([['p_old', 'missed', null], ['p_future', 'open', null]]);
    expect(await scanDeadlines(deps, { now: NOW })).toMatchObject({ missedPromises: 0 });
  });

  it('a late answer after the flip fills respondedAt and keeps it missed', async () => {
    const deps = world('2026-05-30T10:00:00Z');
    await scanDeadlines(deps, { now: NOW });
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' });
    expect(promises(deps)[0]).toMatchObject({ status: 'missed', respondedAt: NOW });
  });
});

describe('tracking: other organizations', () => {
  it('does not answer the promise of an application of another organization', async () => {
    const deps = world('2026-06-05T10:00:00Z');
    deps.store.write({ promises: [promise({ organizationId: ORG_B })] });
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' });
    expect(promises(deps).find((p) => p.organizationId === ORG_B)?.status).toBe('open');
  });
});
