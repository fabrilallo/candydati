import type { MetricsRegistry } from '@candydati/providers';

/** The part of a pg pool the backlog queries use. */
export interface SqlReader {
  query(text: string): Promise<{ readonly rows: ReadonlyArray<Record<string, unknown>> }>;
}

/** pg-boss keeps these counters per queue (refreshed by its maintenance, about once a minute): cheap to read, no scan of the job table. */
const QUEUE_COUNTS = 'select name, queued_count, deferred_count, active_count, failed_count from pgboss.queue';
/** The oldest job still waiting to run (partial index on the waiting states). */
const QUEUE_OLDEST = `select name, extract(epoch from now() - min(created_on))::float8 as age from pgboss.job where state < 'active' and start_after <= now() group by name`;
const OUTBOX = `select
  count(*) filter (where dead_at is null)::int as pending,
  count(*) filter (where dead_at is not null)::int as dead,
  coalesce(extract(epoch from now() - min(occurred_at) filter (where dead_at is null)), 0)::float8 as oldest
  from outbox_event where published_at is null`;
const EMAIL_FAILED = `select count(*)::int as failed from message where direction = 'outbound' and status = 'failed' and created_at >= now() - interval '24 hours'`;

const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0));

/**
 * Queue depth and age, outbox backlog and dead letters, failed outbound emails of the last day: read from the database
 * at each scrape (a failing query is reported by the registry and the rest still answers). Only the worker exposes
 * these, so a scrape of several instances does not count them twice. Counts only: no row content leaves the database.
 */
export function registerBacklogMetrics(registry: MetricsRegistry, db: SqlReader): void {
  const jobs = registry.gauge('candydati_queue_jobs', 'Jobs per queue and state, from pg-boss: queued (ready), deferred (scheduled or retrying later), active, failed (kept by pg-boss).', ['queue', 'state']);
  const oldest = registry.gauge('candydati_queue_oldest_waiting_seconds', 'Age of the oldest job that is ready to run and has not started, per queue.', ['queue']);
  const pending = registry.gauge('candydati_outbox_pending_events', 'Outbox events not yet published to webhooks and automations.');
  const outboxAge = registry.gauge('candydati_outbox_oldest_pending_seconds', 'Age of the oldest pending outbox event, in seconds (0 when none).');
  const dead = registry.gauge('candydati_outbox_dead_events', 'Outbox events parked after their last attempt (dead letters): need a look.');
  const emailFailed = registry.gauge('candydati_email_failed_messages_24h', 'Outbound candidate messages whose delivery failed in the last 24 hours.');
  registry.onCollect(async () => {
    const [counts, ages, outbox, email] = await Promise.all([db.query(QUEUE_COUNTS), db.query(QUEUE_OLDEST), db.query(OUTBOX), db.query(EMAIL_FAILED)]);
    jobs.reset();
    for (const row of counts.rows) {
      const queue = String(row.name);
      jobs.set({ queue, state: 'queued' }, num(row.queued_count));
      jobs.set({ queue, state: 'deferred' }, num(row.deferred_count));
      jobs.set({ queue, state: 'active' }, num(row.active_count));
      jobs.set({ queue, state: 'failed' }, num(row.failed_count));
    }
    oldest.reset();
    for (const row of ages.rows) oldest.set({ queue: String(row.name) }, num(row.age));
    const box = outbox.rows[0] ?? {};
    pending.set({}, num(box.pending));
    dead.set({}, num(box.dead));
    outboxAge.set({}, num(box.oldest));
    emailFailed.set({}, num(email.rows[0]?.failed));
  });
}
