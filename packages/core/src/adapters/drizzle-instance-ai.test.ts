import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleInstanceAi } from './drizzle-instance-ai.js';

const RECORD = {
  provider: 'anthropic',
  secretCiphertext: 'sb1.sealed',
  assistantModel: 'claude-sonnet-5-5',
  fastModel: 'claude-haiku-5-5',
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
    await repo.save({ ...RECORD, provider: 'openai', assistantModel: null });
    expect(await repo.find()).toMatchObject({ provider: 'openai', assistantModel: null, fastModel: 'claude-haiku-5-5' });
    expect(await handle.db.select().from(schema.instanceAiSettings)).toHaveLength(1);
  });
});
