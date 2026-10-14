import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AuditWriteError, ValidationError } from './errors.js';
import { createInMemoryAuditLog, failingAuditLog } from './testing/index.js';
import { cell, createInMemoryTransaction } from './testing/in-memory-transaction.js';
import { inTransaction } from './transaction.js';
import { definePublicCommand, definePublicQuery, defineSystemJob } from './use-case.js';

const SYSTEM = { type: 'system', id: 'x', onBehalfOfUserId: null } as const;

describe('definePublicQuery', () => {
  const query = definePublicQuery({
    name: 'echo',
    input: z.object({ n: z.coerce.number() }),
    handler: async ({ deps, input }: { deps: { base: number }; input: { n: number } }) => deps.base + input.n,
  });

  it('validates input, runs the handler and exposes the name', async () => {
    expect(await query({ base: 1 }, { n: '2' })).toBe(3);
    expect(query.name).toBe('echo');
  });

  it('throws ValidationError on bad input', async () => {
    await expect(query({ base: 1 }, { n: 'x' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('definePublicQuery is read-only', () => {
  const transaction = createInMemoryTransaction();

  it('refuses to open a transaction or append to the audit log from its handler', async () => {
    const writer = definePublicQuery({
      name: 'sneakyWrite',
      input: z.object({}),
      handler: async ({ deps }: { deps: { auditLog: ReturnType<typeof createInMemoryAuditLog>; transaction: typeof transaction } }) =>
        inTransaction(deps, async () => 'wrote'),
    });
    const auditor = definePublicQuery({
      name: 'sneakyAudit',
      input: z.object({}),
      handler: async ({ deps }: { deps: { auditLog: ReturnType<typeof createInMemoryAuditLog> } }) =>
        deps.auditLog.append({ organizationId: 'o', actor: SYSTEM, action: 'message.received', target: { type: 'message', id: 'm' }, metadata: {} }),
    });
    const auditLog = createInMemoryAuditLog();
    await expect(writer({ auditLog, transaction }, {})).rejects.toThrow(/read-only/);
    await expect(auditor({ auditLog }, {})).rejects.toThrow(/read-only/);
    expect(auditLog.events()).toEqual([]);
  });

  it('still reads the audit log', async () => {
    const auditLog = createInMemoryAuditLog();
    const reader = definePublicQuery({ name: 'read', input: z.object({}), handler: async ({ deps }: { deps: { auditLog: typeof auditLog } }) => (await deps.auditLog.list({ organizationId: 'o', page: 1, limit: 1 })).total });
    expect(await reader({ auditLog }, {})).toBe(0);
  });
});

describe('definePublicCommand', () => {
  const stored = cell<readonly string[]>([]);
  const command = definePublicCommand({
    name: 'storeNote',
    input: z.object({ note: z.string().min(1) }),
    actorId: 'test_page',
    audit: {
      action: (_input, result: { id: string | null }) => (result.id === null ? null : 'message.received'),
      organizationOf: () => 'org_a',
      target: (_input, result) => ({ type: 'message', id: result.id ?? '' }),
      metadata: (input) => ({ length: input.note.length }),
    },
    handler: async ({ input, actor }) => {
      expect(actor).toEqual({ type: 'system', id: 'test_page', onBehalfOfUserId: null });
      if (input.note === 'skip') return { id: null };
      stored.set([...stored.get(), input.note]);
      return { id: `n_${input.note}` };
    },
  });

  it('runs the handler and the audit event in one transaction, with the system actor of the page', async () => {
    const auditLog = createInMemoryAuditLog();
    expect(await command({ auditLog, transaction: createInMemoryTransaction() }, { note: 'hello' })).toEqual({ id: 'n_hello' });
    expect(stored.get()).toContain('hello');
    expect(auditLog.events()).toEqual([
      expect.objectContaining({ organizationId: 'org_a', action: 'message.received', actor: { type: 'system', id: 'test_page', onBehalfOfUserId: null }, target: { type: 'message', id: 'n_hello' }, metadata: { length: 5 } }),
    ]);
    expect(command.name).toBe('storeNote');
  });

  it('rolls the handler back when the audit append fails', async () => {
    const error = await command({ auditLog: failingAuditLog(new Error('down')), transaction: createInMemoryTransaction() }, { note: 'lost' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuditWriteError);
    expect(stored.get()).not.toContain('lost');
  });

  it('appends nothing when the audit says null, and validates the input first', async () => {
    const auditLog = createInMemoryAuditLog();
    await command({ auditLog, transaction: createInMemoryTransaction() }, { note: 'skip' });
    expect(auditLog.events()).toEqual([]);
    await expect(command({ auditLog, transaction: createInMemoryTransaction() }, { note: '' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('with a transaction skip, runs the handler outside one (it manages its own) and audits nothing itself', async () => {
    const runs: string[] = [];
    const own = definePublicCommand({
      name: 'ownTransaction',
      input: z.object({}),
      actorId: 'test_page',
      audit: { skip: 'audited inside its own transaction' },
      transaction: { skip: 'the upload must not hold a transaction' },
      handler: async () => 'done',
    });
    const port = { run: async <T,>(work: (r: ReadonlyMap<unknown, unknown>) => Promise<T>) => (runs.push('begin'), work(new Map())) };
    expect(await own({ auditLog: createInMemoryAuditLog(), transaction: port }, {})).toBe('done');
    expect(runs).toEqual([]);
  });
});

describe('defineSystemJob', () => {
  it('may write: it is not a public query', async () => {
    const auditLog = createInMemoryAuditLog();
    const job = defineSystemJob({
      name: 'job',
      input: z.object({}),
      handler: async ({ deps }: { deps: { auditLog: typeof auditLog; transaction: ReturnType<typeof createInMemoryTransaction> } }) =>
        inTransaction(deps, async (tx) => tx.auditLog.append({ organizationId: 'o', actor: SYSTEM, action: 'message.received', target: { type: 'message', id: 'm' }, metadata: {} })),
    });
    await job({ auditLog, transaction: createInMemoryTransaction() }, {});
    expect(auditLog.events()).toHaveLength(1);
    expect(job.name).toBe('job');
  });
});
