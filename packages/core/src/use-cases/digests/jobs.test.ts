import { describe, expect, it } from 'vitest';
import { buildApplication, buildOutboxEvent, createFakeEmailSender, createInMemoryOutbox, createInMemoryWebhookDeliveries, seedAutomationWorld, seedImportWorld, seedMigrationWorld, seedPrivacyData, ORG_A } from '../../testing/index.js';
import { createInMemoryJobViews } from '../../testing/in-memory-job-views.js';
import { createCandidateStore } from '../../testing/in-memory-candidates.js';
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
    expect(result).toMatchObject({ erased: 1, failed: 0, prunedEvents: 1, prunedDeliveries: 0, erasureFailures: [], migrationsPurged: 0, migrationPurgeFailures: [] });
    expect(result.warned).toBeGreaterThan(0);
    expect(result.sent).toBe(result.digests);
    expect(outbox.snapshot().map((e) => e.id)).toEqual(['new']);
    const quiet = await runRetentionJob({ retention, imports: seedImportWorld(), importStaleDays: 7, digest: digest(sender) }, NOW);
    expect(quiet).toMatchObject({ sent: 0, prunedEvents: 0 });
  });

  it('purges the migrations that ended more than a week ago', async () => {
    const NOW = new Date('2027-06-01T03:00:00Z');
    const retention = await seedPrivacyData({ applications: [] });
    const migrations = seedMigrationWorld();
    const ended = { id: 'm1', organizationId: ORG_A, status: 'done' as const, sourceSystem: 's', producer: 'p', connectorMaturity: 'package' as const, createdBy: 'u', counts: {}, stageMapping: [], excludedJobs: [], declarations: null, packageKey: `organizations/${ORG_A}/migrations/m1/package.zip`, error: null, createdAt: NOW, updatedAt: new Date(NOW.getTime() - 8 * DAY), committedAt: null, undoneAt: null, purgedAt: null, groupId: null, part: null };
    await migrations.migrations.create(ended);
    const result = await runRetentionJob({ retention, imports: seedImportWorld(), importStaleDays: 7, migrations, digest: digest() }, NOW);
    expect(result).toMatchObject({ migrationsPurged: 1, migrationPurgeFailures: [] });
  });

  it('deletes the visit counters older than 25 months, and only those', async () => {
    const NOW = new Date('2027-06-01T03:00:00Z');
    const store = createCandidateStore();
    const jobViews = createInMemoryJobViews(store);
    const key = { organizationId: ORG_A, jobId: 'job_1', source: 'direct', campaign: '' };
    await jobViews.increment({ ...key, day: '2025-04-30' });
    await jobViews.increment({ ...key, day: '2025-05-01' });
    await jobViews.increment({ ...key, day: '2027-05-31' });
    const retention = await seedPrivacyData({ applications: [] });
    const result = await runRetentionJob({ retention, imports: seedImportWorld(), importStaleDays: 7, jobViews, digest: digest() }, NOW);
    expect(result.prunedViews).toBe(1);
    expect(store.read().jobViews.map((v) => v.day)).toEqual(['2025-05-01', '2027-05-31']);
  });
});
