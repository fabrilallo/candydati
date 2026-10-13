import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import {
  buildApplication,
  buildCandidate,
  buildOutboxEvent,
  buildWebhookDelivery,
  buildWebhookEndpoint,
  createFakeHostGuard,
  createFakeHttpPoster,
  createInMemoryTaskQueue,
  fakePdfBytes,
  seedAutomationWorld,
  systemActor,
  userActor,
  validApplicationForm,
  ORG_A,
  ORG_B,
  type AutomationSeedOptions,
} from '../../testing/index.js';
import { toCreatedWebhookDto, toWebhookDeliveryDto, toWebhookEndpointDto } from '../../mappers/webhook-dto.js';
import { moveApplication } from '../candidates/move-application.js';
import { decideApplication } from '../candidates/decide-application.js';
import { submitApplication } from '../candidates/submit-application.js';
import { deliverWebhook, WebhookDeliveryError } from './deliver-webhook.js';
import { createWebhook, deleteWebhook, listWebhookDeliveries, listWebhooks, testWebhook, updateWebhook } from './endpoints.js';
import { publishWebhookEvents } from './publish-events.js';
import { signWebhook } from './signature.js';

const NOW = new Date('2026-06-01T10:00:00.000Z');
const admin = userActor({ role: 'admin', organizationId: ORG_A });
const worker = systemActor({ organizationId: ORG_A });
const world = (options: AutomationSeedOptions = {}) => seedAutomationWorld(options);
const issues = async (promise: Promise<unknown>) => ((await promise.catch((e: unknown) => e)) as ValidationError).issues;

describe('webhook endpoints', () => {
  it('creates an endpoint with a generated secret returned once, and audits without it', async () => {
    const deps = world();
    const created = await createWebhook(deps, admin, { url: 'https://hooks.example.com/tt', events: ['job.closed', 'job.closed', 'application.moved'] });
    expect(created.secret).toBe('whsec_test_1');
    expect(created.endpoint).toMatchObject({ organizationId: ORG_A, url: 'https://hooks.example.com/tt', events: ['job.closed', 'application.moved'], enabled: true, createdAt: NOW });
    expect(JSON.stringify(deps.auditLog.events())).not.toContain('whsec_');
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'webhook.saved', target: { type: 'webhook_endpoint', id: created.endpoint.id } });
  });

  it('never returns the secret after creation: list, update and DTOs drop it', async () => {
    const deps = world();
    const created = await createWebhook(deps, admin, { url: 'https://hooks.example.com/tt', events: ['job.closed'] });
    expect(toCreatedWebhookDto(created).secret).toBe(created.secret);
    const listed = (await listWebhooks(deps, admin, {})).map(toWebhookEndpointDto);
    const updated = toWebhookEndpointDto(await updateWebhook(deps, admin, { endpointId: created.endpoint.id, url: 'https://hooks.example.com/v2', events: ['job.closed'], enabled: false }));
    expect(JSON.stringify([listed, updated])).not.toContain('whsec_');
    expect(Object.keys(updated)).not.toContain('secret');
    expect(deps.endpoints.snapshot()[0]).toMatchObject({ secret: created.secret, url: 'https://hooks.example.com/v2', enabled: false });
  });

  it('enforces the URL rules: https only, http://localhost only when private hosts are allowed, no credentials', async () => {
    const deps = world();
    expect(await issues(createWebhook(deps, admin, { url: 'http://hooks.example.com', events: ['job.closed'] }))).toEqual([{ path: 'url', message: 'https_required' }]);
    expect(await issues(createWebhook(deps, admin, { url: 'http://localhost:4000/h', events: ['job.closed'] }))).toEqual([{ path: 'url', message: 'https_required' }]);
    expect(await issues(createWebhook(deps, admin, { url: 'https://u:p@x.io', events: ['job.closed'] }))).toEqual([{ path: 'url', message: 'credentials_not_allowed' }]);
    expect(await issues(createWebhook(deps, admin, { url: 'nonsense', events: ['job.closed'] }))).toEqual([{ path: 'url', message: 'invalid_url' }]);
    const dev = { ...deps, allowPrivateWebhooks: true };
    await expect(createWebhook(dev, admin, { url: 'http://localhost:4000/h', events: ['job.closed'] })).resolves.toBeDefined();
    expect(deps.endpoints.snapshot()).toHaveLength(1);
    await expect(updateWebhook(deps, admin, { endpointId: deps.endpoints.snapshot()[0]?.id ?? '', url: 'http://x.io', events: ['job.closed'] })).rejects.toBeInstanceOf(ValidationError);
  });

  it('needs webhook:manage', async () => {
    for (const role of ['recruiter', 'hiring_manager', 'interviewer'] as const) {
      await expect(createWebhook(world(), userActor({ role, organizationId: ORG_A }), { url: 'https://x.io', events: ['job.closed'] })).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(listWebhooks(world(), userActor({ role: 'recruiter', organizationId: ORG_A }), {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('is isolated per organization', async () => {
    const deps = world({ endpoints: [buildWebhookEndpoint()] });
    const other = userActor({ role: 'owner', organizationId: ORG_B });
    expect(await listWebhooks(deps, other, {})).toEqual([]);
    await expect(updateWebhook(deps, other, { endpointId: 'hook_1', url: 'https://x.io', events: ['job.closed'] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteWebhook(deps, other, { endpointId: 'hook_1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(listWebhookDeliveries(deps, other, { endpointId: 'hook_1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(testWebhook(deps, other, { endpointId: 'hook_1' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes and audits', async () => {
    const deps = world({ endpoints: [buildWebhookEndpoint()] });
    await deleteWebhook(deps, admin, { endpointId: 'hook_1' });
    expect(deps.endpoints.snapshot()).toHaveLength(0);
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'webhook.deleted', target: { id: 'hook_1' } });
  });

  it('test sends a ping to that endpoint only, already published, and lists the delivery log newest first', async () => {
    const deps = world({ endpoints: [buildWebhookEndpoint(), buildWebhookEndpoint({ id: 'hook_2' })] });
    const { eventId } = await testWebhook(deps, admin, { endpointId: 'hook_1' });
    expect(deps.outbox.snapshot()).toEqual([expect.objectContaining({ id: eventId, type: 'ping', data: {}, publishedAt: NOW })]);
    expect(deps.queue.jobs()).toEqual([{ name: 'webhook.deliver', payload: { organizationId: ORG_A, eventId, endpointId: 'hook_1' } }]);
    expect(await deliverWebhook(deps, worker, { organizationId: ORG_A, eventId, endpointId: 'hook_1' })).toBe('delivered');
    await deps.deliveries.append(buildWebhookDelivery({ id: 'older', createdAt: new Date('2026-01-01') }));
    const log = await listWebhookDeliveries(deps, admin, { endpointId: 'hook_1' });
    expect(log.map((d) => d.id)).toEqual([expect.any(String), 'older']);
    expect(toWebhookDeliveryDto(log[0] as never)).toMatchObject({ eventType: 'ping', status: 'success', responseCode: 200, attempt: 1, error: null });
  });
});

describe('publishWebhookEvents', () => {
  const publish = (deps: ReturnType<typeof world>) => publishWebhookEvents(deps, {});

  it('enqueues one delivery per enabled subscribed endpoint of the event organization and marks the event published', async () => {
    const deps = world({
      endpoints: [
        buildWebhookEndpoint({ id: 'a' }),
        buildWebhookEndpoint({ id: 'b', events: ['job.closed'] }),
        buildWebhookEndpoint({ id: 'c', enabled: false }),
        buildWebhookEndpoint({ id: 'other_org', organizationId: ORG_B }),
      ],
      outbox: [buildOutboxEvent()],
    });
    expect(await publish(deps)).toEqual({ published: 1, enqueued: 1, pending: 0 });
    expect(deps.queue.jobs()).toEqual([{ name: 'webhook.deliver', payload: { organizationId: ORG_A, eventId: 'evt_1', endpointId: 'a' } }]);
    expect(deps.outbox.snapshot()[0]?.publishedAt).toEqual(NOW);
    expect(await publish(deps)).toEqual({ published: 0, enqueued: 0, pending: 0 });
  });

  it.each(['job.published', 'job.updated', 'job.closed'] as const)('queues one distribution sync of the job for %s, with or without subscribers', async (type) => {
    const deps = world({ endpoints: [buildWebhookEndpoint({ events: [type] })], outbox: [buildOutboxEvent({ type, data: { jobId: 'job_9' } })] });
    expect(await publish(deps)).toEqual({ published: 1, enqueued: 1, pending: 0 });
    expect(deps.queue.jobs()).toEqual([
      { name: 'webhook.deliver', payload: { organizationId: ORG_A, eventId: 'evt_1', endpointId: 'hook_1' } },
      { name: 'distribution.sync', payload: { organizationId: ORG_A, jobId: 'job_9' } },
    ]);
    const quiet = world({ outbox: [buildOutboxEvent({ type, data: { jobId: 'job_9' } })] });
    await publish(quiet);
    expect(quiet.queue.jobs()).toEqual([{ name: 'distribution.sync', payload: { organizationId: ORG_A, jobId: 'job_9' } }]);
  });

  it('queues no distribution sync for other events or an event without a job id', async () => {
    const deps = world({ outbox: [buildOutboxEvent({ type: 'application.moved', data: { jobId: 'job_9' } }), buildOutboxEvent({ id: 'evt_2', type: 'job.closed', data: {} })] });
    await publish(deps);
    expect(deps.queue.jobs()).toEqual([]);
  });

  it('retries the whole event, sync included, when the distribution task cannot be queued', async () => {
    const failing = world({ outbox: [buildOutboxEvent({ type: 'job.closed', data: { jobId: 'job_9' } })], automationOverrides: { queue: createInMemoryTaskQueue(new Error('down')) } });
    expect(await publish(failing)).toEqual({ published: 0, enqueued: 0, pending: 1 });
  });

  it('marks an event with no subscriber as published, and leaves pings alone', async () => {
    const deps = world({ outbox: [buildOutboxEvent(), buildOutboxEvent({ id: 'ping_1', type: 'ping' })] });
    expect(await publish(deps)).toEqual({ published: 1, enqueued: 0, pending: 1 });
  });

  it('leaves the event unpublished when a delivery cannot be enqueued, so the next run retries', async () => {
    const seed = { endpoints: [buildWebhookEndpoint()], outbox: [buildOutboxEvent(), buildOutboxEvent({ id: 'evt_2' })] };
    const failing = world({ ...seed, automationOverrides: { queue: createInMemoryTaskQueue(new Error('down')) } });
    expect(await publish(failing)).toEqual({ published: 0, enqueued: 0, pending: 2 });
    expect(await publish(world(seed))).toEqual({ published: 2, enqueued: 2, pending: 0 });
  });

  it('respects the batch limit and validates it', async () => {
    const deps = world({ outbox: [buildOutboxEvent(), buildOutboxEvent({ id: 'evt_2' })] });
    expect(await publishWebhookEvents(deps, { limit: 1 })).toMatchObject({ published: 1 });
    await expect(publishWebhookEvents(deps, { limit: 0 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('deliverWebhook', () => {
  const base = () => world({ endpoints: [buildWebhookEndpoint()], outbox: [buildOutboxEvent()] });
  const run = (deps: ReturnType<typeof world>, input = {}) =>
    deliverWebhook(deps, worker, { organizationId: ORG_A, eventId: 'evt_1', endpointId: 'hook_1', ...input });

  it('POSTs the payload with the headers and a signature of "<timestamp>.<body>", and logs the success', async () => {
    const deps = base();
    expect(await run(deps)).toBe('delivered');
    const [request] = deps.poster.requests();
    const timestamp = String(Math.floor(NOW.getTime() / 1000));
    expect(request).toMatchObject({ url: 'https://hooks.example.com/tt', timeoutMs: 10_000 });
    expect(JSON.parse(request?.body ?? '')).toEqual({
      id: 'evt_1',
      type: 'application.received',
      occurredAt: '2026-01-01T00:00:00.000Z',
      organizationId: ORG_A,
      data: { applicationId: 'app_1', jobId: 'job_1' },
    });
    const expected = `sha256=${createHmac('sha256', 'whsec_test_secret').update(`${timestamp}.${request?.body}`).digest('hex')}`;
    expect(request?.headers).toMatchObject({
      'content-type': 'application/json',
      'x-tt-event': 'application.received',
      'x-tt-timestamp': timestamp,
      'x-tt-signature': expected,
      'x-tt-delivery': expect.any(String),
    });
    expect(request?.headers['x-tt-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(deps.deliveries.snapshot()).toEqual([expect.objectContaining({ status: 'success', responseCode: 200, attempt: 1, error: null, endpointId: 'hook_1', eventId: 'evt_1' })]);
  });

  it('signWebhook is HMAC-SHA256 over timestamp.body keyed with the secret', () => {
    expect(signWebhook('s', '100', '{}')).toBe(`sha256=${createHmac('sha256', 's').update('100.{}').digest('hex')}`);
    expect(signWebhook('s', '101', '{}')).not.toBe(signWebhook('s', '100', '{}'));
    expect(signWebhook('t', '100', '{}')).not.toBe(signWebhook('s', '100', '{}'));
  });

  it('refuses a blocked host without sending anything and does not retry', async () => {
    const deps = { ...base(), hostGuard: createFakeHostGuard(false) };
    expect(await run(deps, { lastAttempt: false })).toBe('failed');
    expect(deps.poster.requests()).toEqual([]);
    expect(deps.deliveries.snapshot()[0]).toMatchObject({ status: 'failed', error: 'host_blocked', responseCode: null });
    expect(deps.hostGuard.asked()).toEqual(['https://hooks.example.com/tt']);
  });

  it('logs a non-2xx answer (a redirect included) and rethrows while retries remain', async () => {
    for (const status of [301, 404, 500]) {
      const deps = { ...base(), poster: createFakeHttpPoster({ ok: true, status }) };
      await expect(run(deps, { lastAttempt: false, attempt: 2 })).rejects.toBeInstanceOf(WebhookDeliveryError);
      expect(deps.deliveries.snapshot()[0]).toMatchObject({ status: 'failed', responseCode: status, error: 'http_error', attempt: 2 });
    }
  });

  it('on the last attempt it logs the failure and returns failed instead of throwing', async () => {
    const deps = { ...base(), poster: createFakeHttpPoster({ ok: false, error: 'timeout' }) };
    expect(await run(deps, { attempt: 5 })).toBe('failed');
    expect(deps.deliveries.snapshot()[0]).toMatchObject({ status: 'failed', error: 'timeout', responseCode: null, attempt: 5 });
  });

  it('stops retrying after 5 attempts even if the queue says otherwise', async () => {
    const deps = { ...base(), poster: createFakeHttpPoster({ ok: false, error: 'network_error' }) };
    expect(await run(deps, { attempt: 5, lastAttempt: false })).toBe('failed');
  });

  it('treats a throwing poster as a network error', async () => {
    const deps = { ...base(), poster: createFakeHttpPoster(new Error('boom')) };
    expect(await run(deps)).toBe('failed');
    expect(deps.deliveries.snapshot()[0]?.error).toBe('network_error');
  });

  it('skips a missing, disabled or no longer subscribed endpoint, and a missing event', async () => {
    const disabled = world({ endpoints: [buildWebhookEndpoint({ enabled: false })], outbox: [buildOutboxEvent()] });
    expect(await run(disabled)).toBe('skipped');
    const unsubscribed = world({ endpoints: [buildWebhookEndpoint({ events: ['job.closed'] })], outbox: [buildOutboxEvent()] });
    expect(await run(unsubscribed)).toBe('skipped');
    expect(await run(base(), { endpointId: 'nope' })).toBe('skipped');
    expect(await run(base(), { eventId: 'nope' })).toBe('skipped');
    expect(disabled.poster.requests()).toEqual([]);
  });

  it('delivers a ping to an endpoint that does not subscribe to it', async () => {
    const deps = world({ endpoints: [buildWebhookEndpoint({ events: ['job.closed'] })], outbox: [buildOutboxEvent({ type: 'ping', data: {} })] });
    expect(await run(deps)).toBe('delivered');
  });

  it('never delivers across organizations', async () => {
    const deps = base();
    await expect(deliverWebhook(deps, systemActor({ organizationId: ORG_B }), { organizationId: ORG_A, eventId: 'evt_1', endpointId: 'hook_1' })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await deliverWebhook(deps, systemActor({ organizationId: ORG_B }), { organizationId: ORG_B, eventId: 'evt_1', endpointId: 'hook_1' })).toBe('skipped');
  });
});

describe('webhook payloads carry no personal data', () => {
  it('events recorded by intake, move and decide hold ids and non-personal fields only', async () => {
    const deps = world({
      candidates: [buildCandidate({ organizationId: ORG_A, firstName: 'Zelda', lastName: 'Zorro', email: 'zelda@zorro.example' })],
      applications: [buildApplication({ organizationId: ORG_A, message: 'my secret message' })],
    });
    await submitApplication(deps, { organizationSlug: 'acme', jobSlug: 'backend', form: validApplicationForm({ email: 'new@person.example', firstName: 'Newbie', message: 'private words' }), cv: { bytes: fakePdfBytes(), declaredName: 'cv.pdf' } });
    const recruiter = userActor({ role: 'recruiter', organizationId: ORG_A });
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' });
    await decideApplication(deps, recruiter, { applicationId: 'app_1', outcome: 'not_selected' });
    const events = deps.outbox.snapshot();
    expect(events.map((e) => e.type)).toEqual(['application.received', 'application.moved', 'application.decided']);
    const text = JSON.stringify(events);
    expect(text).not.toMatch(/zelda|zorro|newbie|person\.example|private words|secret message|ada|lovelace|@/i);
    for (const event of events) {
      for (const value of Object.values(event.data)) expect(['string', 'number', 'boolean']).toContain(typeof value);
    }
  });
});
