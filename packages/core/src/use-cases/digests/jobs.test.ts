import { describe, expect, it } from 'vitest';
import { buildApplication, buildOutboxEvent, createFakeEmailSender, createInMemoryOutbox, createInMemoryWebhookDeliveries, seedAutomationWorld, seedImportWorld, seedPrivacyData, ORG_A } from '../../testing/index.js';
import { createInMemoryTransaction } from '../../testing/in-memory-transaction.js';
import { formatDigestFrom } from './digest-email.js';
import { runDeadlineScan } from './run-deadline-scan.js';
import { runRetentionJob } from './run-retention-job.js';

const DAY = 24 * 3600 * 1000;
const digest = (sender = createFakeEmailSender()) => ({
  transaction: createInMemoryTransaction(),
  mail: { sender, from: formatDigestFrom('Platform', 'noreply@mail.example'), platformUrl: 'https://app.example', locale: 'en' as const },
});

describe('runDeadlineScan', () => {
  it('notifies, then emails one digest per person once, also when the job runs again', async () => {
    const now = new Date('2026-06-01T10:00:00.000Z');
    const scan = seedAutomationWorld({ applications: [buildApplication({ organizationId: ORG_A, responseDueAt: new Date(now.getTime() - 3_600_000) })] });
    const sender = createFakeEmailSender();
    const first = await runDeadlineScan({ scan, digest: digest(sender) }, now);
    expect(first).toMatchObject({ digests: 1, sent: 1, failed: 0, feedbackReminded: 0 });
    const again = await runDeadlineScan({ scan, digest: digest(sender) }, now);
    expect(again).toMatchObject({ sent: 0 });
    expect(sender.sent()).toHaveLength(1);
  });
});

describe('runRetentionJob', () => {
  it('erases, warns with one digest, purges and prunes the delivery log, counting only', async () => {
    const NOW = new Date('2027-06-01T03:00:00Z');
    const retention = await seedPrivacyData({
      applications: [
        buildApplication({ id: 'app_old', organizationId: ORG_A, candidateId: 'cand_1', retentionExpiresAt: new Date(NOW.getTime() - DAY) }),
        buildApplication({ id: 'app_soon', organizationId: ORG_A, candidateId: 'cand_2', retentionExpiresAt: new Date(NOW.getTime() + 10 * DAY) }),
      ],
    });
    const outbox = createInMemoryOutbox([buildOutboxEvent({ id: 'old', publishedAt: new Date(NOW.getTime() - 40 * DAY) }), buildOutboxEvent({ id: 'new', publishedAt: NOW })]);
    const sender = createFakeEmailSender();
    const result = await runRetentionJob(
      { retention, imports: seedImportWorld(), importStaleDays: 7, deliveryLog: { outbox, deliveries: createInMemoryWebhookDeliveries() }, digest: digest(sender) },
      NOW,
    );
    expect(result).toMatchObject({ erased: 1, failed: 0, prunedEvents: 1, prunedDeliveries: 0, erasureFailures: [] });
    expect(result.warned).toBeGreaterThan(0);
    expect(result.sent).toBe(result.digests);
    expect(outbox.snapshot().map((e) => e.id)).toEqual(['new']);
    const quiet = await runRetentionJob({ retention, imports: seedImportWorld(), importStaleDays: 7, digest: digest(sender) }, NOW);
    expect(quiet).toMatchObject({ sent: 0, prunedEvents: 0 });
  });
});
