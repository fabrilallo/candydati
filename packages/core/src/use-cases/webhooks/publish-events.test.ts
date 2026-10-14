import { describe, expect, it } from 'vitest';
import { buildOutboxEvent, buildWebhookEndpoint, seedAutomationWorld } from '../../testing/index.js';
import type { WebhookEndpointRepository } from '../../webhook-ports.js';
import { OUTBOX_MAX_ATTEMPTS, outboxRetryAt, publishWebhookEvents } from './publish-events.js';

const NOW = new Date('2026-06-01T10:00:00.000Z');

/** Endpoints whose lookup fails for one poisoned event's organization. */
const poisonedEndpoints = (base: WebhookEndpointRepository, poisoned: string): WebhookEndpointRepository => ({
  ...base,
  listForEvent: async (organizationId, type) => {
    if (organizationId === poisoned) throw Object.assign(new Error('relation broke for alice@example.org'), { code: '42P01' });
    return base.listForEvent(organizationId, type);
  },
});

const poisonedWorld = () => {
  const world = seedAutomationWorld({
    endpoints: [buildWebhookEndpoint()],
    outbox: [buildOutboxEvent({ id: 'evt_poison', organizationId: 'org_poison' }), buildOutboxEvent({ id: 'evt_2' })],
  });
  return { ...world, endpoints: poisonedEndpoints(world.endpoints, 'org_poison'), now: () => NOW };
};

describe('publishWebhookEvents: retries and dead letter (#8)', () => {
  it('a failing event does not stop the newer ones, and counts an attempt with a short code and a backoff', async () => {
    const deps = poisonedWorld();
    const result = await publishWebhookEvents(deps, {});
    expect(result).toEqual({ published: 1, enqueued: 1, pending: 1, failures: [{ eventId: 'evt_poison', code: 'pg_42P01', dead: false }] });
    const poison = await deps.outbox.findWithAttempts('org_poison', 'evt_poison');
    expect(poison).toMatchObject({ attempts: 1, lastError: 'pg_42P01', nextAttemptAt: outboxRetryAt(1, NOW), deadAt: null });
    expect(JSON.stringify(poison)).not.toContain('alice');
    // Not due yet: the next run does not take it.
    expect(await publishWebhookEvents(deps, {})).toEqual({ published: 0, enqueued: 0, pending: 0, failures: [] });
  });

  it('parks the event as dead after the last allowed attempt, and never takes it again', async () => {
    const deps = poisonedWorld();
    let clock = NOW;
    const timed = { ...deps, now: () => clock };
    for (let attempt = 1; attempt <= OUTBOX_MAX_ATTEMPTS; attempt += 1) {
      const result = await publishWebhookEvents(timed, {});
      expect(result.failures).toEqual([{ eventId: 'evt_poison', code: 'pg_42P01', dead: attempt === OUTBOX_MAX_ATTEMPTS }]);
      clock = new Date(clock.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    expect(await deps.outbox.findWithAttempts('org_poison', 'evt_poison')).toMatchObject({ attempts: OUTBOX_MAX_ATTEMPTS, deadAt: expect.any(Date) });
    expect(await publishWebhookEvents(timed, {})).toMatchObject({ pending: 0, failures: [] });
  });

  it('backs off exponentially, capped', () => {
    const first = outboxRetryAt(1, NOW).getTime() - NOW.getTime();
    const second = outboxRetryAt(2, NOW).getTime() - NOW.getTime();
    expect(second).toBe(first * 2);
    expect(outboxRetryAt(40, NOW).getTime() - NOW.getTime()).toBe(6 * 60 * 60 * 1000);
  });
});
