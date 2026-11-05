import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey, withKey } from './testing/api-keys.js';
import { TestUser } from './testing/client.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

let t: TestApp;
let owner: TestUser;
let recruiter: TestUser;
let outsider: TestUser;

interface Overview {
  builtIn: { id: string; aliases: { alias: string; enabled: boolean }[] }[];
  own: { id: string; skill: string; alias: string }[];
  limit: number;
}

beforeAll(async () => {
  t = await createTestApp();
  owner = await new TestUser(t.app, uniqueEmail('owner'), 'Owner').signUp();
  await owner.createOrganization('Skills Org');
  recruiter = await new TestUser(t.app, uniqueEmail('rec'), 'Rec').signUp();
  await recruiter.joinAs(owner, 'recruiter');
  outsider = await new TestUser(t.app, uniqueEmail('out'), 'Out').signUp();
  await outsider.createOrganization('Other Skills Org');
});
afterAll(async () => {
  await t.close();
});

describe('skill aliases', () => {
  it('adds, lists and removes an alias of the organization, and keeps it out of the other one', async () => {
    const added = await owner.post<{ id: string; skill: string; alias: string }>('/api/v1/skill-aliases', { skill: 'golang', alias: 'Go Developer' });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ skill: 'Go', alias: 'Go Developer' });
    const list = await owner.get<Overview>('/api/v1/skill-aliases');
    expect(list.body.data?.own.map((alias) => alias.alias)).toEqual(['Go Developer']);
    expect(list.body.data?.builtIn.find((entry) => entry.id === 'go')?.aliases).toEqual([{ alias: 'golang', enabled: true }]);
    expect((await outsider.get<Overview>('/api/v1/skill-aliases')).body.data?.own).toEqual([]);
    expect((await outsider.delete(`/api/v1/skill-aliases/${added.body.data!.id}`)).status).toBe(404);
    expect((await owner.delete(`/api/v1/skill-aliases/${added.body.data!.id}`)).status).toBe(200);
    expect((await owner.get<Overview>('/api/v1/skill-aliases')).body.data?.own).toEqual([]);
  });

  it('answers 409 with the reason when an alias is taken or already there, 422 for bad text', async () => {
    await owner.post('/api/v1/skill-aliases', { skill: 'Zorgbase', alias: 'Zorgy' });
    expect((await owner.post('/api/v1/skill-aliases', { skill: 'Python', alias: 'zorgy' })).body).toMatchObject({ success: false, error: { code: 'conflict', message: 'alias_taken' } });
    expect((await owner.post('/api/v1/skill-aliases', { skill: 'Zorgbase', alias: 'ZORGY' })).body).toMatchObject({ error: { message: 'alias_redundant' } });
    expect((await owner.post('/api/v1/skill-aliases', { skill: 'Go', alias: '' })).status).toBe(422);
    expect((await owner.post('/api/v1/skill-aliases', { skill: 'Go', alias: 'x'.repeat(61) })).status).toBe(422);
  });

  it('switches a built-in alias off and on, for this organization only', async () => {
    expect((await owner.post('/api/v1/skill-aliases/built-in/disable', { alias: 'Golang' })).body.data).toEqual({ alias: 'Golang', enabled: false });
    expect((await owner.get<Overview>('/api/v1/skill-aliases')).body.data?.builtIn.find((entry) => entry.id === 'go')?.aliases).toEqual([{ alias: 'golang', enabled: false }]);
    expect((await outsider.get<Overview>('/api/v1/skill-aliases')).body.data?.builtIn.find((entry) => entry.id === 'go')?.aliases).toEqual([{ alias: 'golang', enabled: true }]);
    expect((await owner.post('/api/v1/skill-aliases/built-in/enable', { alias: 'golang' })).body.data).toEqual({ alias: 'golang', enabled: true });
    expect((await owner.post('/api/v1/skill-aliases/built-in/disable', { alias: 'not a built-in alias' })).status).toBe(404);
  });

  it('is for owners and admins: a recruiter and an API key are refused', async () => {
    expect((await recruiter.get('/api/v1/skill-aliases')).status).toBe(403);
    expect((await recruiter.post('/api/v1/skill-aliases', { skill: 'Go', alias: 'Gopher' })).status).toBe(403);
    const key = await createKey(owner, ['job:read']);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/skill-aliases')).status).toBe(403);
  });
});
