import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleAuditLog } from './drizzle-audit-log.js';
import { createDrizzleUserDirectory } from './drizzle-user-directory.js';

let handle: DbHandle;
beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 2);
});
afterAll(async () => {
  await handle.close();
});

const org = async (): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
};
const user = async (name: string): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(schema.user).values({ id, name, email: `${id}@x.it` });
  return id;
};

describe('createDrizzleUserDirectory.actorNamesOf', () => {
  it('names members and people who acted in the organization (an invitee who declined), never anyone else', async () => {
    const [orgA, orgB] = [await org(), await org()];
    const member = await user('Rita');
    const invitee = await user('Ivo');
    const stranger = await user('Sara');
    await handle.db.insert(schema.member).values({ id: randomUUID(), organizationId: orgA, userId: member, role: 'recruiter', createdAt: new Date() });
    const audit = createDrizzleAuditLog(handle.db);
    await audit.append({ organizationId: orgA, actor: { type: 'user', id: invitee, onBehalfOfUserId: null }, action: 'invitation.rejected', target: { type: 'invitation', id: 'i' }, metadata: {} });
    await audit.append({ organizationId: orgB, actor: { type: 'user', id: stranger, onBehalfOfUserId: null }, action: 'invitation.rejected', target: { type: 'invitation', id: 'j' }, metadata: {} });
    const dir = createDrizzleUserDirectory(handle.db);
    expect(await dir.actorNamesOf(orgA, [member, invitee, stranger, 'ghost'])).toEqual({ [member]: 'Rita', [invitee]: 'Ivo' });
    expect(await dir.actorNamesOf(orgB, [member, invitee])).toEqual({});
    expect(await dir.actorNamesOf(orgA, [])).toEqual({});
  });
});
