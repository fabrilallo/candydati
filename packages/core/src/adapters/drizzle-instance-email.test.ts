import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleInstanceEmail } from './drizzle-instance-email.js';

const RECORD = {
  provider: 'smtp' as const,
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: 'apikey',
  secretCiphertext: 'sb1.sealed',
  sendingDomain: 'mail.example.com',
  fromLocal: 'jobs',
  verifiedAt: new Date('2026-10-17T10:00:00Z'),
  updatedAt: new Date('2026-10-17T10:00:00Z'),
  updatedBy: null,
};

let handle: DbHandle;
beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 2);
});
afterAll(async () => {
  await handle.close();
});

describe('createDrizzleInstanceEmail', () => {
  beforeEach(async () => {
    await handle.db.delete(schema.instanceEmailSettings);
  });

  it('has nothing at first, then keeps a single row that each save replaces', async () => {
    const repo = createDrizzleInstanceEmail(handle.db);
    expect(await repo.find()).toBeNull();
    await repo.save(RECORD);
    await repo.save({ ...RECORD, provider: 'resend', smtpHost: null, smtpPort: null, smtpUser: null, fromLocal: 'hr' });
    expect(await repo.find()).toMatchObject({ provider: 'resend', smtpHost: null, fromLocal: 'hr', sendingDomain: 'mail.example.com' });
    expect(await handle.db.select().from(schema.instanceEmailSettings)).toHaveLength(1);
  });
});
