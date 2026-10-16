import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../errors.js';
import { agentActor, createInMemoryAuditLog, userActor, type InMemoryAuditLog } from '../testing/index.js';
import { createInMemoryTransaction } from '../testing/in-memory-transaction.js';
import { listAuditLog } from './list-audit-log.js';

const depsOf = (auditLog: InMemoryAuditLog) => ({ auditLog, transaction: createInMemoryTransaction() });

const seed = async (organizationId: string, count: number) => {
  const auditLog = createInMemoryAuditLog();
  for (let i = 0; i < count; i += 1) {
    await auditLog.append({
      organizationId,
      actor: { type: 'user', id: 'u1', onBehalfOfUserId: null },
      action: i % 2 === 0 ? 'member.added' : 'member.removed',
      target: { type: 'member', id: `m${i}` },
    });
  }
  return auditLog;
};

describe('listAuditLog', () => {
  it('lets owners and admins read, scoped to their organization', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const auditLog = await seed('o1', 3);
      await auditLog.append({
        organizationId: 'o2',
        actor: { type: 'user', id: 'u2', onBehalfOfUserId: null },
        action: 'member.added',
        target: { type: 'member', id: 'x' },
      });
      const page = await listAuditLog(depsOf(auditLog), userActor({ role, organizationId: 'o1' }), {});
      expect(page.items.every((e) => e.organizationId === 'o1')).toBe(true);
      expect(page.meta).toEqual({ total: 3, page: 1, limit: 20 });
    }
  });

  it.each(['recruiter', 'hiring_manager', 'interviewer'] as const)('denies %s', async (role) => {
    const auditLog = await seed('o1', 1);
    await expect(listAuditLog(depsOf(auditLog), userActor({ role, organizationId: 'o1' }), {})).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('paginates and filters by action', async () => {
    const auditLog = await seed('o1', 5);
    const admin = userActor({ role: 'admin', organizationId: 'o1' });
    const page2 = await listAuditLog(depsOf(auditLog), admin, { page: 2, limit: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2.meta).toEqual({ total: 5, page: 2, limit: 2 });
    const added = await listAuditLog(depsOf(auditLog), admin, { action: 'member.added' });
    expect(added.meta.total).toBe(3);
  });

  it('accepts query-string values', async () => {
    const auditLog = await seed('o1', 1);
    const page = await listAuditLog(depsOf(auditLog), userActor({ role: 'admin', organizationId: 'o1' }), {
      page: '1',
      limit: '5',
    });
    expect(page.meta.limit).toBe(5);
  });

  it.each([{ page: 0 }, { limit: 0 }, { limit: 101 }, { page: 1.5 }, { action: 'candidate.ranked' }, { page: 'abc' }])(
    'rejects %o',
    async (input) => {
      const auditLog = await seed('o1', 1);
      await expect(
        listAuditLog(depsOf(auditLog), userActor({ role: 'admin', organizationId: 'o1' }), input),
      ).rejects.toBeInstanceOf(ValidationError);
    },
  );

  it('does not record the read itself, not even for a delegated actor', async () => {
    const auditLog = await seed('o1', 1);
    const agent = agentActor({ role: 'admin', organizationId: 'o1', onBehalfOfUserId: 'u7' });
    await listAuditLog(depsOf(auditLog), agent, { limit: 5, action: 'member.added' });
    expect(auditLog.events()).toHaveLength(1);
    expect(auditLog.events().some((e) => e.action === 'audit.read')).toBe(false);
  });

  it('writes no audit event when denied', async () => {
    const auditLog = await seed('o1', 1);
    await listAuditLog(depsOf(auditLog), userActor({ role: 'recruiter', organizationId: 'o1' }), {}).catch(() => undefined);
    expect(auditLog.events()).toHaveLength(1);
  });
});
