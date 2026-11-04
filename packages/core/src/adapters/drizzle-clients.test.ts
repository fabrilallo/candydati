import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import type { ClientShortlist, ClientShortlistItem } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import { buildApplication, buildCandidate, buildClient, buildJob } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleClients, createDrizzleJobClients, createDrizzlePublicJobClients, createDrizzleShortlists } from './drizzle-clients.js';
import { createDrizzleOrganizationSettings } from './drizzle-job-requests.js';
import { createDrizzleJobs } from './drizzle-jobs.js';

let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');
const LATER = new Date('2026-06-15T00:00:00Z');

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

async function world() {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  await createDrizzleJobs(handle.db).create(buildJob({ id: jobId, slug: jobId, organizationId: org }));
  const candidateId = randomUUID();
  await createDrizzleCandidates(handle.db).create(buildCandidate({ id: candidateId, organizationId: org, email: `${candidateId}@x.example` }));
  const applicationId = randomUUID();
  await createDrizzleApplications(handle.db).create(buildApplication({ id: applicationId, organizationId: org, jobId, candidateId }));
  const client = await createDrizzleClients(handle.db).create(buildClient({ id: randomUUID(), organizationId: org }));
  return { org, jobId, applicationId, clientId: client.id };
}

const shortlistOf = (org: string, jobId: string, clientId: string, overrides: Partial<ClientShortlist> = {}): ClientShortlist => ({
  id: randomUUID(), organizationId: org, jobId, clientId, recipientContactId: 'contact_1', recipientName: 'Carla', recipientEmail: 'carla@client.example',
  tokenHash: randomUUID(), message: null, expiresAt: LATER, revokedAt: null, remindersSent: 0, lastReminderAt: null, firstOpenedAt: null, createdBy: 'u', createdAt: NOW, ...overrides,
});

const itemOf = (org: string, shortlistId: string, applicationId: string): ClientShortlistItem => ({
  id: randomUUID(), organizationId: org, shortlistId, applicationId, position: 0, shareCv: true, sharedNoteIds: ['note_1'], answer: null, answerReason: null, answeredAt: null, candidateNotifiedAt: null,
});

describe('clients on Postgres', () => {
  it('stores contacts, refuses a second client with the same name in any case, archives and lists by name', async () => {
    const { org, clientId } = await world();
    const clients = createDrizzleClients(handle.db);
    await expect(clients.create(buildClient({ id: randomUUID(), organizationId: org, name: 'ACME TEST CLIENT' }))).rejects.toBeInstanceOf(ConflictError);
    const second = await clients.create(buildClient({ id: randomUUID(), organizationId: org, name: 'Alpha' }));
    expect((await clients.list(org, { includeArchived: false })).map((c) => c.name)).toEqual(['Acme Test Client', 'Alpha']);
    expect((await clients.findById(org, clientId))?.contacts).toEqual([{ id: 'contact_1', name: 'Carla Contact', email: 'carla@client.example' }]);
    await expect(clients.update(org, second.id, { name: 'acme test client', website: null, logoUrl: null, contacts: [], updatedAt: NOW })).rejects.toBeInstanceOf(ConflictError);
    await clients.setArchived(org, second.id, NOW, NOW);
    expect(await clients.list(org, { includeArchived: false })).toHaveLength(1);
    expect(await clients.findById(randomUUID(), clientId)).toBeNull();
  });

  it('links a job to one client, counts and lists by client, and shows only the public face', async () => {
    const { org, jobId, clientId } = await world();
    const links = createDrizzleJobClients(handle.db);
    await links.set({ organizationId: org, jobId, clientId, display: 'named', updatedBy: 'u', updatedAt: NOW });
    await links.set({ organizationId: org, jobId, clientId, display: 'confidential', updatedBy: 'u', updatedAt: NOW });
    expect(await links.findByJob(org, jobId)).toMatchObject({ clientId, display: 'confidential' });
    expect(await links.listJobIdsByClient(org, clientId)).toEqual([jobId]);
    expect(await links.countByClient(org)).toEqual({ [clientId]: 1 });
    expect(await links.listByJobs(org, [])).toEqual([]);
    await createDrizzleOrganizationSettings(handle.db).setAgency(org, { recruitsForClients: true, agencyAuthorization: 'Aut. 9' }, NOW);
    const shown = await createDrizzlePublicJobClients(handle.db).forJobs(org, [jobId]);
    expect(shown).toEqual({ [jobId]: { display: 'confidential', name: null, website: null, logo: null, agencyAuthorization: 'Aut. 9' } });
    await links.remove(org, jobId);
    expect(await links.findByJob(org, jobId)).toBeNull();
  });
});

describe('shortlists on Postgres', () => {
  it('creates a shortlist with its items, finds it by hash and lets each candidate be answered once', async () => {
    const { org, jobId, applicationId, clientId } = await world();
    const repo = createDrizzleShortlists(handle.db);
    const shortlist = shortlistOf(org, jobId, clientId);
    const item = itemOf(org, shortlist.id, applicationId);
    await repo.create(shortlist, [item]);
    await expect(repo.create({ ...shortlist, id: randomUUID() }, [])).rejects.toBeInstanceOf(ConflictError);
    expect(await repo.findByTokenHash(shortlist.tokenHash)).toEqual(shortlist);
    expect(await repo.listByJob(org, jobId)).toEqual([shortlist]);
    expect(await repo.listItems(org, [shortlist.id])).toEqual([item]);
    const write = { answer: 'meet', reason: 'Strong profile', at: NOW } as const;
    expect(await repo.answer(randomUUID(), shortlist.id, item.id, write)).toBe(false);
    expect(await repo.answer(org, shortlist.id, item.id, write)).toBe(true);
    expect(await repo.answer(org, shortlist.id, item.id, { ...write, answer: 'not_for_us' })).toBe(false);
    expect((await repo.listItemsByApplication(org, applicationId))[0]).toMatchObject({ answer: 'meet', answerReason: 'Strong profile' });
  });

  it('opens once, revokes once, rotates a token only from the expected hash, and lists the open ones', async () => {
    const { org, jobId, applicationId, clientId } = await world();
    const repo = createDrizzleShortlists(handle.db);
    const shortlist = shortlistOf(org, jobId, clientId);
    await repo.create(shortlist, [itemOf(org, shortlist.id, applicationId)]);
    expect(await repo.markOpened(org, shortlist.id, NOW)).toBe(true);
    expect(await repo.markOpened(org, shortlist.id, LATER)).toBe(false);
    const patch = { tokenHash: randomUUID(), remindersSent: 1, lastReminderAt: NOW };
    expect(await repo.rotateToken(org, shortlist.id, 'wrong', patch)).toBeNull();
    expect(await repo.rotateToken(org, shortlist.id, shortlist.tokenHash, patch)).toMatchObject(patch);
    expect((await repo.listOpenAcrossOrganizations(NOW)).map((s) => s.id)).toContain(shortlist.id);
    expect(await repo.revoke(org, shortlist.id, NOW)).toBe(true);
    expect(await repo.revoke(org, shortlist.id, NOW)).toBe(false);
    expect((await repo.listOpenAcrossOrganizations(NOW)).map((s) => s.id)).not.toContain(shortlist.id);
  });

  it('marks candidates notified and deletes the items of erased applications', async () => {
    const { org, jobId, applicationId, clientId } = await world();
    const repo = createDrizzleShortlists(handle.db);
    const shortlist = shortlistOf(org, jobId, clientId);
    const item = itemOf(org, shortlist.id, applicationId);
    await repo.create(shortlist, [item]);
    await repo.markCandidateNotified(org, [item.id], NOW);
    expect((await repo.listItems(org, [shortlist.id]))[0]?.candidateNotifiedAt).toEqual(NOW);
    await repo.deleteItemsOfApplications(org, [applicationId]);
    expect(await repo.listItemsByApplication(org, applicationId)).toEqual([]);
  });
});
