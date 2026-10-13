import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { auditLog, organization } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;

/** drizzle wraps driver errors in "Failed query"; the Postgres message is on `cause`. */
const rejectionMessage = async (promise: PromiseLike<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: Error }).cause;
    return `${(error as Error).message} ${cause?.message ?? ''}`;
  }
  throw new Error('Expected the statement to be rejected');
};

const insertOrg = async (slug: string): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(organization).values({ id, name: slug, slug, createdAt: new Date() });
  return id;
};

const insertEvent = async (organizationId: string, metadata: Record<string, unknown> = {}): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(auditLog).values({
    id,
    organizationId,
    actorType: 'user',
    actorId: 'user-1',
    action: 'member.added',
    targetType: 'member',
    targetId: 'member-1',
    metadata,
  });
  return id;
};

describe('database migrations and audit_log', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });

  afterAll(async () => {
    await handle.close();
  });

  it('applies migrations on an empty database and is idempotent', async () => {
    await expect(runMigrations(url)).resolves.toBeUndefined();
    const { rows } = await handle.pool.query(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = rows.map((r: { table_name: string }) => r.table_name);
    for (const t of ['user', 'session', 'account', 'verification', 'organization', 'member', 'invitation', 'audit_log']) {
      expect(names).toContain(t);
    }
  });

  it('inserts an audit row and round-trips metadata', async () => {
    const orgId = await insertOrg('roundtrip');
    const metadata = { role: 'recruiter', nested: { a: [1, 2, 3] } };
    const id = await insertEvent(orgId, metadata);
    const [row] = await handle.db.select().from(auditLog).where(eq(auditLog.id, id));
    expect(row?.metadata).toEqual(metadata);
    expect(row?.occurredAt).toBeInstanceOf(Date);
    expect(row?.onBehalfOfUserId).toBeNull();
  });

  it('defaults metadata to an empty object', async () => {
    const orgId = await insertOrg('defaults');
    const id = await insertEvent(orgId);
    const [row] = await handle.db.select().from(auditLog).where(eq(auditLog.id, id));
    expect(row?.metadata).toEqual({});
  });

  it('rejects UPDATE on audit_log', async () => {
    const id = await insertEvent(await insertOrg('no-update'));
    const message = await rejectionMessage(
      handle.db.update(auditLog).set({ action: 'member.removed' }).where(eq(auditLog.id, id)),
    );
    expect(message).toMatch(/append-only/i);
  });

  it('rejects DELETE on audit_log', async () => {
    const id = await insertEvent(await insertOrg('no-delete'));
    expect(await rejectionMessage(handle.db.delete(auditLog).where(eq(auditLog.id, id)))).toMatch(/append-only/i);
    const rows = await handle.db.select().from(auditLog).where(eq(auditLog.id, id));
    expect(rows).toHaveLength(1);
  });

  it('rejects TRUNCATE on audit_log', async () => {
    expect(await rejectionMessage(handle.pool.query('truncate audit_log'))).toMatch(/append-only/i);
  });

  it('refuses to delete an organization that has audit rows', async () => {
    const orgId = await insertOrg('has-log');
    await insertEvent(orgId);
    await expect(handle.pool.query('delete from organization where id = $1', [orgId])).rejects.toThrow();
  });

  it('separates two organizations by organization_id', async () => {
    const a = await insertOrg('org-a');
    const b = await insertOrg('org-b');
    await insertEvent(a);
    await insertEvent(a);
    await insertEvent(b);
    const rowsA = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.organizationId, a)))
      .orderBy(desc(auditLog.occurredAt));
    const rowsB = await handle.db.select().from(auditLog).where(eq(auditLog.organizationId, b));
    expect(rowsA).toHaveLength(2);
    expect(rowsB).toHaveLength(1);
    expect(rowsA.every((r) => r.organizationId === a)).toBe(true);
  });
});
