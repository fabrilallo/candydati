import { describe, expect, it } from 'vitest';
import { createInMemoryAuditLog, failingAuditLog } from './in-memory-audit-log.js';

const event = (organizationId: string, action: 'member.added' | 'member.removed' = 'member.added') => ({
  organizationId,
  actor: { type: 'user' as const, id: 'u1', onBehalfOfUserId: null },
  action,
  target: { type: 'member', id: 'm1' },
});

describe('in-memory audit log', () => {
  it('assigns id and date and applies metadata default', async () => {
    const log = createInMemoryAuditLog();
    const stored = await log.append(event('o1'));
    expect(stored.id).toBeTruthy();
    expect(stored.occurredAt).toBeInstanceOf(Date);
    expect(stored.metadata).toEqual({});
  });

  it('rejects invalid events like the real repository would', async () => {
    const log = createInMemoryAuditLog();
    await expect(log.append({ ...event('o1'), organizationId: '' })).rejects.toThrow();
  });

  it('lists newest first, scoped to the organization, filtered and paginated', async () => {
    const log = createInMemoryAuditLog();
    await log.append(event('o1'));
    await log.append(event('o2'));
    await log.append(event('o1', 'member.removed'));
    await log.append(event('o1'));

    const all = await log.list({ organizationId: 'o1', page: 1, limit: 2 });
    expect(all.total).toBe(3);
    expect(all.items).toHaveLength(2);
    expect(all.items[0]!.occurredAt.getTime()).toBeGreaterThanOrEqual(all.items[1]!.occurredAt.getTime());

    const second = await log.list({ organizationId: 'o1', page: 2, limit: 2 });
    expect(second.items).toHaveLength(1);

    const filtered = await log.list({ organizationId: 'o1', page: 1, limit: 10, action: 'member.removed' });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]!.action).toBe('member.removed');
  });

  it('exposes a copy of the stored events', async () => {
    const log = createInMemoryAuditLog();
    await log.append(event('o1'));
    const snapshot = log.events();
    expect(snapshot).toHaveLength(1);
    (snapshot as unknown[]).pop();
    expect(log.events()).toHaveLength(1);
  });

  it('can fail on append', async () => {
    const log = failingAuditLog(new Error('boom'));
    await expect(log.append(event('o1'))).rejects.toThrow('boom');
    expect(log.events()).toHaveLength(0);
  });
});
