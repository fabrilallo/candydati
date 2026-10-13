import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { AuditWriteError, ForbiddenError, ValidationError } from './errors.js';
import { defineUseCase } from './use-case.js';
import { agentActor, createInMemoryAuditLog, failingAuditLog, userActor } from './testing/index.js';
import { createInMemoryTransaction } from './testing/in-memory-transaction.js';

const tx = createInMemoryTransaction();

const renameOrg = defineUseCase({
  name: 'renameOrganization',
  input: z.object({ organizationId: z.string().min(1), name: z.string().min(1) }),
  permission: 'organization:update',
  organizationOf: (input) => input.organizationId,
  audit: {
    action: 'organization.updated',
    target: (input) => ({ type: 'organization', id: input.organizationId }),
    metadata: (input, result) => ({ name: input.name, previous: result.previous }),
  },
  handler: async ({ input }) => ({ previous: 'Old', name: input.name }),
});

const peek = defineUseCase({
  name: 'peek',
  input: z.object({}),
  permission: 'audit:read',
  audit: { skip: 'read-only, nothing changes' },
  handler: async () => 'value',
});

const valid = { organizationId: 'o1', name: 'New' };
const admin = userActor({ role: 'admin', organizationId: 'o1' });

describe('defineUseCase', () => {
  it('exposes name and permission for adapters', () => {
    expect(renameOrg.meta).toEqual({ name: 'renameOrganization', permission: 'organization:update' });
  });

  it('runs the handler and writes exactly one audit event on success', async () => {
    const auditLog = createInMemoryAuditLog();
    const result = await renameOrg({ auditLog, transaction: tx }, admin, valid);
    expect(result).toEqual({ previous: 'Old', name: 'New' });
    const events = auditLog.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      organizationId: 'o1',
      action: 'organization.updated',
      target: { type: 'organization', id: 'o1' },
      metadata: { name: 'New', previous: 'Old' },
      actor: { type: 'user', id: admin.id, onBehalfOfUserId: null },
    });
  });

  it('records an agent with the user it acts for', async () => {
    const auditLog = createInMemoryAuditLog();
    await renameOrg({ auditLog, transaction: tx }, agentActor({ role: 'admin', organizationId: 'o1', onBehalfOfUserId: 'u9' }), valid);
    expect(auditLog.events()[0]!.actor).toMatchObject({ type: 'agent', onBehalfOfUserId: 'u9' });
  });

  it('rejects invalid input before the handler, with no audit event', async () => {
    const auditLog = createInMemoryAuditLog();
    const promise = renameOrg({ auditLog, transaction: tx }, admin, { organizationId: 'o1', name: '' });
    await expect(promise).rejects.toBeInstanceOf(ValidationError);
    await expect(promise).rejects.toMatchObject({ issues: [{ path: 'name' }] });
    expect(auditLog.events()).toHaveLength(0);
  });

  it('denies a role without the permission, with no audit event', async () => {
    const auditLog = createInMemoryAuditLog();
    await expect(renameOrg({ auditLog, transaction: tx }, userActor({ role: 'recruiter', organizationId: 'o1' }), valid)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(auditLog.events()).toHaveLength(0);
  });

  it('denies cross-organization access', async () => {
    const auditLog = createInMemoryAuditLog();
    const owner = userActor({ role: 'owner', organizationId: 'other' });
    await expect(renameOrg({ auditLog, transaction: tx }, owner, valid)).rejects.toBeInstanceOf(ForbiddenError);
    expect(auditLog.events()).toHaveLength(0);
  });

  it('writes no success event when the handler fails and rethrows its error', async () => {
    const failing = defineUseCase({
      name: 'failing',
      input: z.object({}),
      permission: 'audit:read',
      audit: { action: 'audit.read', target: () => ({ type: 'audit_log', id: 'x' }) },
      handler: async () => {
        throw new Error('handler failed');
      },
    });
    const auditLog = createInMemoryAuditLog();
    await expect(failing({ auditLog, transaction: tx }, admin, {})).rejects.toThrow('handler failed');
    expect(auditLog.events()).toHaveLength(0);
  });

  it('does not report success when the audit append fails', async () => {
    const cause = new Error('db down');
    const auditLog = failingAuditLog(cause);
    const error = await renameOrg({ auditLog, transaction: tx }, admin, valid).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuditWriteError);
    expect((error as AuditWriteError).cause).toBe(cause);
  });

  it('lets an explicitly read-only use case skip the audit', async () => {
    const auditLog = createInMemoryAuditLog();
    const append = vi.spyOn(auditLog, 'append');
    expect(await peek({ auditLog, transaction: tx }, admin, {})).toBe('value');
    expect(append).not.toHaveBeenCalled();
  });

  it('still authorizes an audit-free use case', async () => {
    const auditLog = createInMemoryAuditLog();
    await expect(peek({ auditLog, transaction: tx }, userActor({ role: 'recruiter' }), {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('supports an explicit permission opt-out, still scoped to the organization', async () => {
    const open = defineUseCase({
      name: 'open',
      input: z.object({ organizationId: z.string() }),
      permission: { skip: 'authorization done by the caller' },
      organizationOf: (i) => i.organizationId,
      audit: { skip: 'test' },
      handler: async () => 1,
    });
    const auditLog = createInMemoryAuditLog();
    expect(await open({ auditLog, transaction: tx }, userActor({ role: 'interviewer', organizationId: 'o1' }), { organizationId: 'o1' })).toBe(1);
    await expect(
      open({ auditLog, transaction: tx }, userActor({ role: 'interviewer', organizationId: 'o1' }), { organizationId: 'o2' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(open.meta.permission).toBeNull();
  });

  it('does not mutate the raw input or the actor', async () => {
    const auditLog = createInMemoryAuditLog();
    const raw = Object.freeze({ organizationId: 'o1', name: 'New' });
    const frozenActor = Object.freeze({ ...admin });
    await expect(renameOrg({ auditLog, transaction: tx }, frozenActor, raw)).resolves.toBeDefined();
    expect(raw).toEqual(valid);
  });

  it('defaults metadata to empty when the definition gives none', async () => {
    const bare = defineUseCase({
      name: 'bare',
      input: z.object({}),
      permission: 'audit:read',
      audit: { action: 'audit.read', target: () => ({ type: 'audit_log', id: 'o1' }) },
      handler: async () => null,
    });
    const auditLog = createInMemoryAuditLog();
    await bare({ auditLog, transaction: tx }, admin, {});
    expect(auditLog.events()[0]!.metadata).toEqual({});
  });

  it('appends nothing when the action function returns null (the handler audited in its own transaction)', async () => {
    const selfAudited = defineUseCase({
      name: 'selfAudited',
      input: z.object({}),
      permission: 'audit:read',
      audit: { action: () => null, target: () => ({ type: 'audit_log', id: 'o1' }) },
      handler: async () => null,
    });
    const auditLog = createInMemoryAuditLog();
    await selfAudited({ auditLog, transaction: tx }, admin, {});
    expect(auditLog.events()).toHaveLength(0);
  });
});
