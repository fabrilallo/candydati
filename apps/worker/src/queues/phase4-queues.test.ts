import { seedHrWorld, createFakeEmailSender, createFakeHostGuard, createFakeHttpPoster, buildApplication, buildAutomationRule, buildJob, buildEmailTemplate, buildOutboxEvent, buildWebhookEndpoint, seedAutomationWorld, ORG_A, createInMemoryTransaction } from '@tt/core/testing';
import { formatDigestFrom } from '@tt/core';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createAutomationRunQueue } from './automation-run.js';
import { createDeadlinesScanQueue, DEADLINES_SCAN_CRON } from './deadlines-scan.js';
import { createWebhookDeliverQueue } from './webhook-deliver.js';
import { createWebhookPublishQueue, WEBHOOK_PUBLISH_CRON } from './webhook-publish.js';

const logger = pino({ level: 'silent' });
const job = (payload: unknown, lastAttempt = true, attempt = 1) => ({ jobId: 'j1', payload, logger, lastAttempt, attempt });

describe('automation.run', () => {
  it('runs the rules of the stage and rejects a payload without ids', async () => {
    const deps = seedAutomationWorld({ applications: [buildApplication({ organizationId: ORG_A, stageId: 'stage-0' })], rules: [buildAutomationRule()] });
    const queue = createAutomationRunQueue(deps);
    expect(queue.payload.safeParse({ organizationId: ORG_A }).success).toBe(false);
    await queue.handle(job({ organizationId: ORG_A, applicationId: 'app_1', stageId: 'stage-0' }));
    expect(deps.tasks.snapshot()).toHaveLength(1);
  });

  it('queues a message for a send_template rule in the rule creator name', async () => {
    const deps = seedAutomationWorld({
      applications: [buildApplication({ organizationId: ORG_A, stageId: 'stage-0' })],
      messaging: { templates: [buildEmailTemplate({ id: 'tpl_1', organizationId: ORG_A })] },
      rules: [buildAutomationRule({ action: { type: 'send_template', templateId: 'tpl_1' }, createdBy: 'recruiter_1' })],
    });
    await createAutomationRunQueue(deps).handle(job({ organizationId: ORG_A, applicationId: 'app_1', stageId: 'stage-0' }));
    expect(deps.messagingStore.read().messages[0]).toMatchObject({ status: 'queued', sentBy: 'recruiter_1' });
  });
});

describe('webhook.deliver', () => {
  const payload = { organizationId: ORG_A, eventId: 'evt_1', endpointId: 'hook_1' };
  const world = (poster = createFakeHttpPoster()) =>
    seedAutomationWorld({ endpoints: [buildWebhookEndpoint()], outbox: [buildOutboxEvent({ publishedAt: new Date() })], automationOverrides: { poster, hostGuard: createFakeHostGuard() } });

  it('delivers and logs a success', async () => {
    const deps = world();
    await createWebhookDeliverQueue(deps).handle(job(payload));
    expect(deps.poster.requests()).toHaveLength(1);
    expect((await deps.deliveries.listByEndpoint(ORG_A, 'hook_1', 10))[0]).toMatchObject({ status: 'success', attempt: 1 });
  });

  it('rethrows a failure while retries remain and logs it as failed on the last attempt', async () => {
    const deps = world(createFakeHttpPoster({ ok: true, status: 500 }));
    const queue = createWebhookDeliverQueue(deps);
    await expect(queue.handle(job(payload, false, 2))).rejects.toThrow(/http_error/);
    await queue.handle(job(payload, true, 5));
    const rows = await deps.deliveries.listByEndpoint(ORG_A, 'hook_1', 10);
    expect(rows.map((r) => [r.attempt, r.status, r.error])).toEqual(expect.arrayContaining([[2, 'failed', 'http_error'], [5, 'failed', 'http_error']]));
  });

  it('refuses a blocked host for good, without posting', async () => {
    const deps = seedAutomationWorld({ endpoints: [buildWebhookEndpoint()], outbox: [buildOutboxEvent({ publishedAt: new Date() })], automationOverrides: { hostGuard: createFakeHostGuard(false) } });
    await createWebhookDeliverQueue(deps).handle(job(payload, false));
    expect(deps.poster.requests()).toHaveLength(0);
    expect((await deps.deliveries.listByEndpoint(ORG_A, 'hook_1', 10))[0]).toMatchObject({ error: 'host_blocked' });
  });
});

describe('webhooks.publish', () => {
  it('is scheduled every minute and fans the outbox out', async () => {
    const deps = seedAutomationWorld({ endpoints: [buildWebhookEndpoint()], outbox: [buildOutboxEvent()] });
    const queue = createWebhookPublishQueue(deps);
    expect(queue.schedule).toEqual({ cron: WEBHOOK_PUBLISH_CRON, data: {} });
    expect(WEBHOOK_PUBLISH_CRON).toBe('* * * * *');
    await queue.handle(job(null));
    expect(deps.queue.jobs()).toEqual([{ name: 'webhook.deliver', payload: { organizationId: ORG_A, eventId: 'evt_1', endpointId: 'hook_1' } }]);
  });
});

describe('deadlines.scan', () => {
  it('is scheduled hourly, creates notifications once and emails the digest', async () => {
    const now = new Date('2026-06-01T10:00:00.000Z');
    const deps = seedAutomationWorld({ applications: [buildApplication({ organizationId: ORG_A, responseDueAt: new Date(now.getTime() - 3_600_000) })] });
    const sender = createFakeEmailSender();
    const queue = createDeadlinesScanQueue({ scan: deps, digest: { transaction: createInMemoryTransaction(), mail: { sender, from: formatDigestFrom('Platform', 'noreply@mail.example'), platformUrl: 'https://app.example', locale: 'en' } }, now: () => now });
    expect(queue.schedule).toEqual({ cron: DEADLINES_SCAN_CRON, data: {} });
    expect(DEADLINES_SCAN_CRON).toBe('0 * * * *');
    await queue.handle(job(null));
    expect(deps.notifications.snapshot().map((n) => n.kind)).toEqual(['response_overdue']);
    expect(sender.sent()).toHaveLength(1);
    expect(sender.sent()[0]?.text).toContain('/app/attention');
    await queue.handle(job(null));
    expect(sender.sent()).toHaveLength(1);
  });

  it('keeps the digest of a failed send for the next scan and sends it once the mailbox answers', async () => {
    const now = new Date('2026-06-01T10:00:00.000Z');
    const deps = seedAutomationWorld({ applications: [buildApplication({ organizationId: ORG_A, responseDueAt: new Date(now.getTime() - 3_600_000) })] });
    let down = true;
    const sent: unknown[] = [];
    const sender = { send: async (message: unknown) => { if (down) throw new Error('smtp down'); sent.push(message); return { messageId: 'm1' }; } } as unknown as ReturnType<typeof createFakeEmailSender>;
    const queue = createDeadlinesScanQueue({ scan: deps, digest: { transaction: createInMemoryTransaction(), mail: { sender, from: formatDigestFrom('Platform', 'noreply@mail.example'), platformUrl: 'https://app.example', locale: 'en' } }, now: () => now });
    await queue.handle(job(null));
    expect(sent).toHaveLength(0);
    down = false;
    await queue.handle(job(null));
    expect(sent).toHaveLength(1);
    expect(deps.notifications.snapshot()).toHaveLength(1);
    await queue.handle(job(null));
    expect(sent).toHaveLength(1);
  });

  it('also reminds interviewers and flags ads idle for 90 days, with one digest per person', async () => {
    const now = new Date('2026-06-01T10:00:00.000Z');
    const day = 86_400_000;
    const ago = (days: number) => new Date(now.getTime() - days * day);
    const hr = seedHrWorld({ jobs: [buildJob({ id: 'stale_1', slug: 'stale-1', organizationId: ORG_A, status: 'published', publishedAt: ago(120), updatedAt: ago(120), createdBy: 'recruiter_1' })], overrides: { now: () => now } });
    const sender = createFakeEmailSender();
    const queue = createDeadlinesScanQueue({ scan: seedAutomationWorld(), feedback: hr, stale: hr, digest: { transaction: createInMemoryTransaction(), mail: { sender, from: formatDigestFrom('Platform', 'noreply@mail.example'), platformUrl: 'https://app.example', locale: 'en' } }, now: () => now });
    await queue.handle(job(null));
    expect(hr.notifications.snapshot().map((n) => n.kind)).toEqual(['job_stale']);
    expect(sender.sent()).toHaveLength(1);
    expect(sender.sent()[0]?.text).toContain('ad idle for 90 days');
    await queue.handle(job(null));
    expect(sender.sent()).toHaveLength(1);
  });
});
