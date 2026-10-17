import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleInstanceAi } from './drizzle-instance-ai.js';

const RECORD = {
  assistantProvider: 'openai',
  assistantModel: 'gpt-6-luna',
  fastProvider: 'google',
  fastModel: 'gemini-3.1-flash-lite',
  keysCiphertext: 'sb1.sealed',
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

describe('createDrizzleInstanceAi', () => {
  beforeEach(async () => {
    await handle.db.delete(schema.instanceAiSettings);
  });

  it('has nothing at first, then keeps a single row that each save replaces', async () => {
    const repo = createDrizzleInstanceAi(handle.db);
    expect(await repo.find()).toBeNull();
    await repo.save(RECORD);
    await repo.save({ ...RECORD, assistantProvider: null, assistantModel: null });
    expect(await repo.find()).toMatchObject({ assistantProvider: null, assistantModel: null, fastModel: 'gemini-3.1-flash-lite' });
    expect(await handle.db.select().from(schema.instanceAiSettings)).toHaveLength(1);
  });
});
