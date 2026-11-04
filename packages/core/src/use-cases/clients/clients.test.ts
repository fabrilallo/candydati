import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { agentActor, apiKeyActor, userActor } from '../../testing/actors.js';
import { ORG_A, ORG_B } from '../../testing/candidate-seed.js';
import { buildClient, seedClientWorld } from '../../testing/client-deps.js';
import { getAgencySetting, setAgencySetting } from './agency-setting.js';
import { archiveClient, createClient, getClient, listClients, updateClient } from './clients.js';
import { getJobClient, setJobClient } from './job-client.js';

const owner = userActor({ organizationId: ORG_A, id: 'user_test', role: 'owner' });
const recruiter = userActor({ organizationId: ORG_A, id: 'recruiter_1', role: 'recruiter' });
const manager = userActor({ organizationId: ORG_A, id: 'hm_1', role: 'hiring_manager' });
const stranger = userActor({ organizationId: ORG_B, id: 'user_b', role: 'owner' });

describe('agency setting', () => {
  it('is off by default and turned on by a person, with the authorization reference, audited', async () => {
    const deps = await seedClientWorld({ agency: false });
    expect(await getAgencySetting(deps, manager, {})).toEqual({ recruitsForClients: false, agencyAuthorization: null });
    const on = await setAgencySetting(deps, owner, { recruitsForClients: true, agencyAuthorization: ' Aut. Min. 42 ' });
    expect(on).toEqual({ recruitsForClients: true, agencyAuthorization: 'Aut. Min. 42' });
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'organization.agency_setting_updated', metadata: { recruitsForClients: true } });
  });

  it('is an owner or admin decision, never a key or the assistant', async () => {
    const deps = await seedClientWorld({ agency: false });
    const input = { recruitsForClients: true };
    await expect(setAgencySetting(deps, recruiter, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setAgencySetting(deps, apiKeyActor({ organizationId: ORG_A, role: 'owner' }), input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setAgencySetting(deps, agentActor({ organizationId: ORG_A, role: 'owner' }), input)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('clients', () => {
  it('creates a client with contacts, lists it with its job count and reads it, audited without contact data', async () => {
    const deps = await seedClientWorld({ clients: [] });
    const created = await createClient(deps, recruiter, { name: 'Beta Test Spa', website: 'https://beta.example', contacts: [{ name: 'Bruno', email: 'Bruno@Beta.Example' }] });
    expect(created).toMatchObject({ name: 'Beta Test Spa', website: 'https://beta.example', logoUrl: null, archived: false, jobCount: 0 });
    expect(created.contacts).toEqual([{ id: expect.any(String), name: 'Bruno', email: 'bruno@beta.example' }]);
    expect(await listClients(deps, manager, {})).toEqual([created]);
    expect(await getClient(deps, manager, { clientId: created.id })).toEqual(created);
    const event = deps.auditLog.events().at(-1);
    expect(event).toMatchObject({ action: 'client.created', target: { type: 'client', id: created.id }, metadata: { contacts: 1 } });
    expect(JSON.stringify(event)).not.toContain('bruno');
  });

  it('refuses clients while the organization does not recruit for clients, and duplicate names', async () => {
    await expect(createClient(await seedClientWorld({ agency: false }), owner, { name: 'X' })).rejects.toBeInstanceOf(ConflictError);
    const deps = await seedClientWorld();
    await expect(createClient(deps, owner, { name: 'acme test client' })).rejects.toBeInstanceOf(ConflictError);
    await expect(createClient(deps, owner, { name: '' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('updates keeping the ids of known contacts and giving new ones a fresh id', async () => {
    const deps = await seedClientWorld();
    const updated = await updateClient(deps, recruiter, {
      clientId: 'client_1',
      name: 'Acme Renamed',
      contacts: [{ id: 'contact_1', name: 'Carla C.', email: 'carla@client.example' }, { id: 'forged', name: 'Dino', email: 'dino@client.example' }],
    });
    expect(updated.contacts[0]).toEqual({ id: 'contact_1', name: 'Carla C.', email: 'carla@client.example' });
    expect(updated.contacts[1]?.id).not.toBe('forged');
    expect(updated.website).toBeNull();
    expect(deps.auditLog.events().at(-1)?.action).toBe('client.updated');
  });

  it('archives and restores; archived clients are listed only when asked', async () => {
    const deps = await seedClientWorld();
    await archiveClient(deps, recruiter, { clientId: 'client_1', archived: true });
    expect(await listClients(deps, recruiter, {})).toEqual([]);
    expect(await listClients(deps, recruiter, { includeArchived: true })).toHaveLength(1);
    await archiveClient(deps, recruiter, { clientId: 'client_1', archived: false });
    expect(deps.auditLog.events().map((e) => e.action).slice(-2)).toEqual(['client.archived', 'client.restored']);
  });

  it('keeps managing with recruiters and above, and organizations apart', async () => {
    const deps = await seedClientWorld();
    await expect(createClient(deps, manager, { name: 'New' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createClient(deps, apiKeyActor({ organizationId: ORG_A, role: 'owner' }), { name: 'New' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getClient(deps, stranger, { clientId: 'client_1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateClient(deps, stranger, { clientId: 'client_1', name: 'Mine' })).rejects.toBeInstanceOf(NotFoundError);
    expect(await listClients(deps, stranger, {})).toEqual([]);
  });

  it('lets keys and the assistant read clients', async () => {
    const deps = await seedClientWorld();
    expect(await listClients(deps, apiKeyActor({ organizationId: ORG_A, role: 'recruiter' }), {})).toHaveLength(1);
    expect(await listClients(deps, agentActor({ organizationId: ORG_A, role: 'recruiter' }), {})).toHaveLength(1);
  });
});

describe('the client of a job', () => {
  it('links a job to a client with the display choice, counts it on the client and unlinks it', async () => {
    const deps = await seedClientWorld();
    expect(await getJobClient(deps, recruiter, { jobId: 'job_1' })).toEqual({ jobId: 'job_1', client: null, display: 'named' });
    const linked = await setJobClient(deps, recruiter, { jobId: 'job_1', clientId: 'client_1', display: 'confidential' });
    expect(linked).toEqual({ jobId: 'job_1', client: { id: 'client_1', name: 'Acme Test Client', archived: false }, display: 'confidential' });
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'job.client_updated', target: { type: 'job', id: 'job_1' }, metadata: { clientId: 'client_1', display: 'confidential' } });
    expect((await listClients(deps, recruiter, {}))[0]?.jobCount).toBe(1);
    expect(await setJobClient(deps, recruiter, { jobId: 'job_1', clientId: null })).toEqual({ jobId: 'job_1', client: null, display: 'named' });
  });

  it('refuses unknown or archived clients, unknown jobs, other organizations and a switched-off setting', async () => {
    const deps = await seedClientWorld({ clients: [buildClient(), buildClient({ id: 'client_old', name: 'Old', archivedAt: new Date() })] });
    await expect(setJobClient(deps, recruiter, { jobId: 'job_1', clientId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(setJobClient(deps, recruiter, { jobId: 'job_1', clientId: 'client_old' })).rejects.toBeInstanceOf(ConflictError);
    await expect(setJobClient(deps, recruiter, { jobId: 'job_x', clientId: 'client_1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(setJobClient(deps, stranger, { jobId: 'job_1', clientId: 'client_1' })).rejects.toBeInstanceOf(NotFoundError);
    const off = await seedClientWorld({ agency: false });
    await expect(setJobClient(off, recruiter, { jobId: 'job_1', clientId: 'client_1' })).rejects.toBeInstanceOf(ConflictError);
  });
});
